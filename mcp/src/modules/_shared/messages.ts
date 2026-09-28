/**
 * The forward-leading message catalogue (plan "Tool specs" → *Messages*,
 * "4-principle compliance matrix" principle 4) — the only catalogue for
 * error and ok/stub texts: a service or repository throws a typed
 * `DomainError` (no prose, see `platform/errors.ts`); `toToolResult` turns
 * one into the `isError:true` text the model sees, always naming the next
 * tool or step. The few non-error ("ok") states (`run_agent_on_pr` timing
 * out, `get_findings` still running/none, `get_conventions` empty) and the
 * `list_agents`' "No agents configured." text, and `get_blast_radius`'s
 * degraded-reason / "no callers" texts, are rendered by the small helper
 * functions below and embedded in a successful `content` text by each module's
 * `tools.ts` — they are informational, not `isError`. A module's `render.ts`
 * is the separate, sibling catalogue for structured RESULT lines (one line
 * per finding/agent/convention row); it never composes error or ok/stub prose.
 */
import type { CallToolResult } from '@modelcontextprotocol/server';
import { McpError, type DomainError } from '../../platform/errors.js';
import { truncate } from '../../lib/text.js';

const MAX_MESSAGE_LEN = 200;

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

export interface ToolErrorContext {
  /** The tool name the error is being rendered for (`retry {tool}` text). */
  tool: string;
  /** Only needed to render `RunNotFound` ("Run {id} not found on {repo}#{pr}"). */
  repo?: string;
  pr?: number;
}

/**
 * Maps a thrown `DomainError` (or, defensively, any other error) to an
 * `isError:true` `CallToolResult`. Exhaustive over `DomainError` (item B):
 * the `switch` below discriminates on `.code`, and TypeScript rejects the
 * build if a new `McpError` subclass is added to `platform/errors.ts`
 * without a matching `case` here (the `default` branch's `never` check).
 * Anything that isn't even an `McpError` (a genuine bug — see the comment
 * below) gets the same defensive fallback text as before.
 */
export function toToolResult(err: unknown, ctx: ToolErrorContext): CallToolResult {
  if (!(err instanceof McpError)) {
    // Defensive fallback — every error a service throws is a DomainError; this
    // only fires on a genuine bug (e.g. a rejected promise from somewhere else).
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(
      `DevDigest API error 500 on ${ctx.tool}: ${truncate(message, MAX_MESSAGE_LEN)}. Retry once; if it persists check the API terminal.`,
    );
  }

  const de = err as DomainError;
  switch (de.code) {
    case 'ApiUnreachable':
      return errorResult(
        `DevDigest API is not reachable at ${de.url}. Start it with ./scripts/dev.sh, then retry ${ctx.tool}.`,
      );
    case 'RateLimited':
      return errorResult(`DevDigest rate limit hit (reviews: 10/min). Wait a minute, then retry ${ctx.tool}.`);
    case 'RepoNotFound':
      return errorResult(
        `Repo '${de.repo}' is not imported in DevDigest. Known repos: ${de.known.join(', ')}. Add it in the DevDigest UI, then retry.`,
      );
    case 'PrNotFound':
      return errorResult(
        `PR #${de.pr} not found in ${de.repo}. Recent PRs: ${de.recent.map((n) => `#${n}`).join(', ')}. Retry with one of these.`,
      );
    case 'AgentNotFound':
      return errorResult(`Agent '${de.agent}' not found. Call list_agents for valid names.`);
    case 'AgentAmbiguous':
      return errorResult(
        `Agent '${de.agent}' is ambiguous (${de.names.join(', ')}). Retry with an id from list_agents.`,
      );
    case 'RunFailed': {
      const verb = de.status === 'cancelled' ? 'was cancelled' : 'failed';
      return errorResult(
        `Run ${de.runId} ${verb}: ${truncate(de.error ?? 'no error detail', MAX_MESSAGE_LEN)}. Check the agent's provider key in DevDigest Settings, then call run_agent_on_pr again.`,
      );
    }
    case 'RunNotFound': {
      const prLabel = ctx.repo != null && ctx.pr != null ? `${ctx.repo}#${ctx.pr}` : (ctx.repo ?? 'the PR');
      return errorResult(
        `Run ${de.runId} not found on ${prLabel}. Omit run_id for the latest findings, or check repo/pr.`,
      );
    }
    case 'ApiFailure':
      return errorResult(
        `DevDigest API error ${de.status} on ${ctx.tool}: ${truncate(de.apiMessage, MAX_MESSAGE_LEN)}. Retry once; if it persists check the API terminal.`,
      );
    case 'MalformedResponse':
      return errorResult(
        `DevDigest API returned an unexpected response shape from ${de.endpoint}. Retry ${ctx.tool} once; if it persists check the API terminal.`,
      );
    case 'NoRunStarted':
      return errorResult(
        `DevDigest API did not start a run for this PR. Retry run_agent_on_pr once; if it persists check the API terminal.`,
      );
    default: {
      const _exhaustive: never = de;
      return errorResult(
        `DevDigest API error 500 on ${ctx.tool}: ${truncate(String(_exhaustive), MAX_MESSAGE_LEN)}. Retry once; if it persists check the API terminal.`,
      );
    }
  }
}

// ---- Non-error ("ok") forward-leading texts, embedded in a successful
// result's `next` field / text content, never in `isError` content. --------

/** `run_agent_on_pr`: the wait budget ran out, the run is still going server-side. */
export function waitExhaustedMessage(opts: { elapsedS: number; repo: string; pr: number; runId: string }): string {
  return `Still running after ${opts.elapsedS}s — do NOT start another run. Call get_findings with repo=${opts.repo}, pr=${opts.pr}, run_id=${opts.runId} in about a minute.`;
}

/** `get_findings`: the run named by `run_id` (or the only active run) hasn't finished yet. */
export function getFindingsRunningMessage(): string {
  return 'Call get_findings again in ~30 s.';
}

/** `get_findings`: no completed review exists for this PR yet. */
export function noReviewsMessage(prLabel: string): string {
  return `No completed reviews for ${prLabel}. Call run_agent_on_pr to review it.`;
}

/** `get_conventions`: the repo has no extracted conventions yet. */
export function noConventionsMessage(repo: string): string {
  return `No conventions for ${repo}. Extract them from the DevDigest UI (it spends LLM credits), then retry get_conventions.`;
}

/** `run_agent_on_pr` done state: points at the full-detail follow-up call. */
export function fullDetailHint(runId: string): string {
  return `full text: get_findings with run_id=${runId}, detail=full`;
}

/** `list_agents`: no agents are configured yet. */
export function noAgentsMessage(): string {
  return 'No agents configured.';
}

// Hand-typed literal union, not imported from `modules/blast/ports.ts`
// (`shared-messages`'s allowlist has no `ports` entry — this catalogue stays
// self-contained, per `mcp-package.md`'s import rules).
type BlastDegradedReason = 'flag_off' | 'index_failed' | 'index_partial' | 'repo_too_large' | 'no_data';

const BLAST_DEGRADED_REASON_TEXT: Record<BlastDegradedReason, string> = {
  flag_off: 'Repo-intel indexing is turned off for this repo — blast radius is unavailable.',
  index_failed: 'The repo-intel index failed to build, so this result may be incomplete. Resync the repo, then retry.',
  index_partial: 'The repo-intel index is only partially built, so this result may be incomplete.',
  repo_too_large: 'This repo is too large for a full repo-intel index, so this result is limited.',
  no_data: 'No repo-intel index data is available for this repo yet.',
};

/** `get_blast_radius`: the degraded-reason line shown above the blast-radius text when `degraded:true`. */
export function degradedReasonMessage(reason: BlastDegradedReason): string {
  return BLAST_DEGRADED_REASON_TEXT[reason];
}

/** `get_blast_radius`: a changed symbol with zero callers found in the indexed code. */
export function noCallersMessage(): string {
  return 'No callers found in the indexed code; nothing else references this symbol.';
}
