import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../../platform/container.js';
import { ReviewsApiRepository } from './repository.js';
import { ReviewsService, type GetFindingsInput, type RunAgentOnPrOptions } from './service.js';
import type { Severity } from './ports.js';
import { renderFindingLine, renderFindingsDoneHeader, renderRunAgentOnPrDoneHeader } from './render.js';
import { toToolResult, getFindingsRunningMessage, noReviewsMessage, waitExhaustedMessage, fullDetailHint } from '../_shared/messages.js';
import { RepoField, PrField, AgentField } from '../_shared/schemas.js';

const SEVERITY_TO_DOMAIN: Record<'critical' | 'warning' | 'suggestion', Severity> = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  suggestion: 'SUGGESTION',
};

// `verdict` is server-composed output (never attacker/model input), so the
// output schemas below trade the strict `z.enum([...])` for a plain nullable
// string: zod 4's JSON Schema conversion repeats the full enum value list at
// every occurrence (no `$ref` de-duplication), and `verdict` appears in both
// tools this module registers (twice in `get_findings`) — the enum form alone
// was ~210 of the ~1,600 chars this package had to shed to clear the
// ≤6,000 char `tools/list` budget (Token budget, acceptance (a)). The real
// domain type (`Verdict | null`) still governs every call site in
// TypeScript; only the wire-level JSON Schema is loosened.
const VerdictField = z.string().nullable();

// `{critical, warning, suggestion}` counts, shared by both tools this module
// registers. A `z.record` (one JSON Schema `additionalProperties` entry)
// instead of three named `z.number()` properties trims roughly two thirds of
// this field's advertised size — the same token-budget trade as
// `VerdictField` above; the actual runtime object always has exactly these
// three keys (`helpers.ts`'s `counts()`).
const CountsField = z.record(z.string(), z.number());

// ---- get_findings -----------------------------------------------------

const GetFindingsInputSchema = z.object({
  repo: RepoField,
  pr: PrField,
  // No format/pattern validation (plan says "uuid", but zod's built-in
  // `.uuid()` alone costs ~230 chars of `tools/list` budget — acceptance
  // (a)); the service does a plain string match against known run ids, so
  // an ill-formed value just fails to match rather than needing rejection
  // up front.
  run_id: z.string().optional().describe('Specific run id; omit for latest per agent'),
  severity: z.enum(['critical', 'warning', 'suggestion']).optional().describe('Minimum severity to include'),
  detail: z.enum(['summary', 'full']).default('summary').describe('summary=1 line; full=+rationale/suggestion'),
  limit: z.number().min(1).max(50).default(20).describe('Max findings to return (1-50; full detail capped lower)'),
});

// Declares the `detail:"summary"` (default) shape only. `detail:"full"` adds
// `end_line`/`category`/`rationale`/`suggestion` at runtime; `.passthrough()`
// lets those through without inflating every `tools/list` response with 4
// more field declarations most calls never use (Token budget, acceptance (a)).
const FindingItemSchema = z
  .object({
    severity: z.string(),
    file: z.string(),
    line: z.number(),
    title: z.string(),
    agent: z.string().optional(),
  })
  .passthrough();

const GetFindingsOutputSchema = z.object({
  // `status` is server-composed output (`'done' | 'running' | 'none'` in
  // TypeScript, see `service.ts`'s `GetFindingsResult`); plain `z.string()`
  // for the same token-budget reason as `VerdictField`.
  status: z.string(),
  pr: z.string(),
  verdict: VerdictField,
  reviews: z.array(
    z.object({
      agent: z.string().nullable(),
      run_id: z.string().nullable(),
      verdict: VerdictField,
      score: z.number().nullable(),
    }),
  ),
  counts: CountsField,
  findings: z.array(FindingItemSchema),
  more: z.number(),
  running_run_ids: z.array(z.string()).optional(),
  next: z.string().optional(),
});

const EMPTY_COUNTS = { critical: 0, warning: 0, suggestion: 0 };

/** `get_findings` — completed reviews of a PR; no LLM cost, never starts a review. */
export function registerGetFindingsTool(server: McpServer, service: Pick<ReviewsService, 'getFindings'>): void {
  server.registerTool(
    'get_findings',
    {
      description:
        "Verdict and findings of completed DevDigest reviews of a PR: one run (run_id) or the latest run of each agent. Use after run_agent_on_pr returns status 'running'. No LLM cost.",
      inputSchema: GetFindingsInputSchema,
      outputSchema: GetFindingsOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const input: GetFindingsInput = {
          repo: args.repo,
          pr: args.pr,
          runId: args.run_id,
          minSeverity: args.severity ? SEVERITY_TO_DOMAIN[args.severity] : undefined,
          detail: args.detail,
          limit: args.limit,
        };
        const result = await service.getFindings(input);

        if (result.status === 'done') {
          const structuredContent = {
            status: 'done' as const,
            pr: result.pr,
            verdict: result.verdict,
            reviews: result.reviews,
            counts: result.counts,
            findings: result.findings,
            more: result.more,
          };
          const lines = [
            renderFindingsDoneHeader(result.pr, result.verdict),
            ...result.findings.map(renderFindingLine),
          ];
          return { structuredContent, content: [{ type: 'text', text: lines.join('\n') }] };
        }

        if (result.status === 'running') {
          const next = getFindingsRunningMessage();
          const structuredContent = {
            status: 'running' as const,
            pr: result.pr,
            verdict: null,
            reviews: [],
            counts: EMPTY_COUNTS,
            findings: [],
            more: 0,
            ...(result.running_run_ids ? { running_run_ids: result.running_run_ids } : {}),
            next,
          };
          return { structuredContent, content: [{ type: 'text', text: next }] };
        }

        const next = noReviewsMessage(result.pr);
        const structuredContent = {
          status: 'none' as const,
          pr: result.pr,
          verdict: null,
          reviews: [],
          counts: EMPTY_COUNTS,
          findings: [],
          more: 0,
          next,
        };
        return { structuredContent, content: [{ type: 'text', text: next }] };
      } catch (err) {
        return toToolResult(err, { tool: 'get_findings', repo: args.repo, pr: args.pr });
      }
    },
  );
}

// ---- run_agent_on_pr ---------------------------------------------------

const RunAgentOnPrInputSchema = z.object({ repo: RepoField, pr: PrField, agent: AgentField });

// `severity` here is server-composed output, not client input — plain
// `z.string()` instead of `z.enum([...])` for the same token-budget reason as
// `VerdictField` above.
const RunAgentFindingItemSchema = z.object({
  severity: z.string(),
  file: z.string(),
  line: z.number(),
  title: z.string(),
});

const RunAgentOnPrOutputSchema = z.object({
  // `status` is server-composed output (`'done' | 'running'` in TypeScript,
  // see `service.ts`'s `RunAgentOnPrResult`); plain `z.string()` for the same
  // token-budget reason as `VerdictField`.
  status: z.string(),
  pr: z.string(),
  agent: z.string(),
  run_id: z.string(),
  verdict: VerdictField,
  score: z.number().nullable(),
  counts: CountsField,
  findings: z.array(RunAgentFindingItemSchema),
  more: z.number(),
  next: z.string().optional(),
});

/**
 * `run_agent_on_pr` — resolve, create, wait (poll DB status), findings.
 * Bridges the service's plain `onProgress`/`AbortSignal` to
 * `ctx.mcpReq.notify`/`ctx.mcpReq.signal` (Onion layering: "the core does not
 * know MCP" — `service.ts` never sees `ctx`).
 */
export function registerRunAgentOnPrTool(
  server: McpServer,
  service: Pick<ReviewsService, 'runAgentOnPr'>,
  opts: { waitMs: number; pollMs?: number },
): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        "Run one DevDigest reviewer agent on an imported PR, wait for it to finish (up to ~100 s) and return the verdict and findings. Spends LLM credits; each call starts a new run. If it returns status 'running', call get_findings with run_id — do not rerun.",
      inputSchema: RunAgentOnPrInputSchema,
      outputSchema: RunAgentOnPrOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      try {
        const progressToken = ctx.mcpReq._meta?.progressToken;
        const runOpts: RunAgentOnPrOptions = {
          waitMs: opts.waitMs,
          pollMs: opts.pollMs,
          signal: ctx.mcpReq.signal,
          onProgress: (elapsedS, totalS) => {
            if (progressToken == null) return;
            void ctx.mcpReq
              .notify({
                method: 'notifications/progress',
                params: { progressToken, progress: elapsedS, total: totalS },
              })
              .catch(() => {
                // Best-effort only — a dropped progress notification never fails the tool call.
              });
          },
        };
        const result = await service.runAgentOnPr({ repo: args.repo, pr: args.pr, agent: args.agent }, runOpts);

        if (result.status === 'done') {
          const structuredContent = {
            status: 'done' as const,
            pr: result.pr,
            agent: result.agent,
            run_id: result.run_id,
            verdict: result.verdict,
            score: result.score,
            counts: result.counts,
            findings: result.findings.map(({ severity, file, line, title }) => ({ severity, file, line, title })),
            more: result.more,
            next: fullDetailHint(result.run_id),
          };
          const lines = [
            renderRunAgentOnPrDoneHeader(result.pr, result.agent, result.verdict, result.score),
            ...result.findings.map(renderFindingLine),
          ];
          return { structuredContent, content: [{ type: 'text', text: lines.join('\n') }] };
        }

        const next = waitExhaustedMessage({
          elapsedS: Math.round(opts.waitMs / 1000),
          repo: args.repo,
          pr: args.pr,
          runId: result.run_id,
        });
        const structuredContent = {
          status: 'running' as const,
          pr: result.pr,
          agent: result.agent,
          run_id: result.run_id,
          verdict: null,
          score: null,
          counts: EMPTY_COUNTS,
          findings: [],
          more: 0,
          next,
        };
        return { structuredContent, content: [{ type: 'text', text: next }] };
      } catch (err) {
        return toToolResult(err, { tool: 'run_agent_on_pr', repo: args.repo, pr: args.pr });
      }
    },
  );
}

/**
 * Builds this module's repository + service from the container and
 * registers both its tools (`get_findings`, `run_agent_on_pr`) — mirrors a
 * Fastify `routes.ts` building its service from `container.db`
 * (`server/src/modules/pulls/routes.ts:26-30`).
 */
export function registerReviewsTools(server: McpServer, container: AppContainer): void {
  const service = new ReviewsService({
    store: new ReviewsApiRepository(container.client),
    resolver: container.resolver,
  });
  registerGetFindingsTool(server, service);
  registerRunAgentOnPrTool(server, service, { waitMs: container.waitMs, pollMs: container.pollMs });
}
