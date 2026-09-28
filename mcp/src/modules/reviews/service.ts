import type { ReviewsStore, ReviewRecord, Severity, Verdict } from './ports.js';
import type { Resolver } from '../_shared/resolver.js';
import { buildFindingsPayload, latestPerAgent, type FindingsPayload, type SummaryFindingItem } from './helpers.js';
import { DEFAULT_LIMIT, MAX_LIMIT, FULL_LIMIT_MAX, DEFAULT_POLL_MS, FINDINGS_LIMIT } from './constants.js';
import { ApiFailure, NoRunStarted, RateLimited, RunFailed, RunNotFound } from '../../platform/errors.js';

export interface GetFindingsInput {
  repo: string;
  pr: number;
  runId?: string;
  minSeverity?: Severity;
  detail?: 'summary' | 'full';
  limit?: number;
}

/**
 * Bare domain result — no forward-leading prose (Onion layering: "the core
 * does not know MCP"). `tools.ts` turns `running`/`none` into the catalogue
 * text from the plan's *Messages* table.
 */
export type GetFindingsResult =
  | ({ status: 'done'; pr: string } & FindingsPayload)
  // `running_run_ids` holds run ids (`GET /pulls/:id/runs/active` returns only
  // `{run_id,status,error}` — no agent name), not agent names; named for what
  // it actually contains.
  | { status: 'running'; pr: string; running_run_ids?: string[] }
  | { status: 'none'; pr: string };

export interface RunAgentOnPrInput {
  repo: string;
  pr: number;
  agent: string;
}

export interface RunAgentOnPrOptions {
  /** Total polling budget in ms (`platform/config.ts`'s `waitMs`, passed in as a value). */
  waitMs: number;
  /** Poll interval; defaults to 3s (plan: "~20 req/min, under the global 120/min"). */
  pollMs?: number;
  onProgress?: (elapsedS: number, totalS: number) => void;
  /** Abort the WAIT only — never cancels the run itself (it keeps running server-side). */
  signal?: AbortSignal;
}

export interface RunAgentOnPrDoneResult {
  status: 'done';
  pr: string;
  agent: string;
  run_id: string;
  verdict: Verdict | null;
  score: number | null;
  counts: { critical: number; warning: number; suggestion: number };
  findings: SummaryFindingItem[];
  more: number;
}

/**
 * Bare domain result when the wait budget runs out (or the caller aborts) —
 * no forward-leading prose; `tools.ts` renders the "do NOT start another run"
 * text from the plan's *Messages* table.
 */
export interface RunAgentOnPrRunningResult {
  status: 'running';
  pr: string;
  agent: string;
  run_id: string;
}

export type RunAgentOnPrResult = RunAgentOnPrDoneResult | RunAgentOnPrRunningResult;

export interface ReviewsServiceDeps {
  store: ReviewsStore;
  resolver: Resolver;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `reviews` service — `get_findings` (read-only) and `run_agent_on_pr`
 * (resolve → create → poll → findings). Constructor takes a named deps type
 * (dependency inversion), consistently with `AgentsServiceDeps`/`ConventionsServiceDeps`.
 */
export class ReviewsService {
  constructor(private readonly deps: ReviewsServiceDeps) {}

  /**
   * `get_findings` — completed reviews of a PR (one run, or latest-per-agent).
   * No LLM cost: reads only, never starts a review. `runAgentOnPr` owns the
   * "wait, then read the trace" race (root/server INSIGHTS 2026-09-19); this
   * method never reads `/runs/:id/trace` either.
   */
  async getFindings(input: GetFindingsInput): Promise<GetFindingsResult> {
    const { store, resolver } = this.deps;
    const repo = await resolver.resolveRepo(input.repo);
    const prId = await resolver.resolvePr(input.repo, repo.id, input.pr);
    const prLabel = `${repo.full_name}#${input.pr}`;
    const detail = input.detail ?? 'summary';
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, detail === 'full' ? FULL_LIMIT_MAX : MAX_LIMIT);

    // A cached `prId` (`resolver.resolvePr`'s process-lifetime cache) can go
    // stale if the PR is deleted after resolution; the API 404s on the first
    // call that uses it. Evict so the *next* call re-resolves, rather than
    // reusing a dead id forever (small, tested in `test/resolver.test.ts`).
    async function listReviews(): Promise<ReviewRecord[]> {
      try {
        return await store.listReviews(prId);
      } catch (err) {
        if (err instanceof ApiFailure && err.status === 404) resolver.invalidatePr(input.repo, input.pr);
        throw err;
      }
    }

    if (input.runId) {
      const reviews = await listReviews();
      const match = reviews.find((r) => r.run_id === input.runId);
      if (match) {
        return {
          status: 'done',
          pr: prLabel,
          ...buildFindingsPayload([match], { minSeverity: input.minSeverity, limit, detail }),
        };
      }

      const runs = await store.listRuns(prId);
      const run = runs.find((r) => r.run_id === input.runId);
      if (!run) throw new RunNotFound(input.runId);
      if (run.status === 'failed' || run.status === 'cancelled') {
        throw new RunFailed(run.run_id, run.status, run.error);
      }
      return { status: 'running', pr: prLabel };
    }

    const reviews = await listReviews();
    if (reviews.length === 0) {
      const active = await store.listActiveRuns(prId);
      if (active.length > 0) {
        return { status: 'running', pr: prLabel, running_run_ids: active.map((r) => r.run_id) };
      }
      return { status: 'none', pr: prLabel };
    }

    const latest = latestPerAgent(reviews);
    return {
      status: 'done',
      pr: prLabel,
      ...buildFindingsPayload(latest, { minSeverity: input.minSeverity, limit, detail }),
    };
  }

  /**
   * `run_agent_on_pr` — resolve → create → poll → findings. Polls DB status
   * via `listRuns`, never SSE (`/runs/:id/events` hangs forever for a run the
   * bus never completed after an API restart) and never reads
   * `/runs/:id/trace` (server INSIGHTS 2026-09-19: `completeAgentRun` runs
   * before `saveRunTrace`, so the trace can lag `done`; `insertReview`/
   * `insertFindings` precede `completeAgentRun`, so `GET /pulls/:id/reviews`
   * is race-free once `done`).
   */
  async runAgentOnPr(input: RunAgentOnPrInput, opts: RunAgentOnPrOptions): Promise<RunAgentOnPrResult> {
    const { store, resolver } = this.deps;
    const repo = await resolver.resolveRepo(input.repo);
    const prId = await resolver.resolvePr(input.repo, repo.id, input.pr);
    const agent = await resolver.resolveAgent(input.agent);
    const prLabel = `${repo.full_name}#${input.pr}`;

    // A cached `prId` (`resolver.resolvePr`'s process-lifetime cache) can go
    // stale if the PR is deleted after resolution; evict so the next call
    // re-resolves, rather than reusing a dead id forever (small, tested in
    // `test/resolver.test.ts`).
    let started;
    try {
      started = await store.startReview(prId, agent.id);
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 404) resolver.invalidatePr(input.repo, input.pr);
      throw err;
    }
    const run = started[0];
    if (!run) {
      throw new NoRunStarted(prId);
    }
    const runId = run.run_id;
    const runningResult: RunAgentOnPrRunningResult = {
      status: 'running',
      pr: prLabel,
      agent: agent.name,
      run_id: runId,
    };

    const pollMsBase = opts.pollMs ?? DEFAULT_POLL_MS;
    let pollMs = pollMsBase;
    const totalS = Math.round(opts.waitMs / 1000);
    const deadline = Date.now() + opts.waitMs;
    let rateLimitedOnce = false;

    while (Date.now() < deadline) {
      if (opts.signal?.aborted) return runningResult;

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(pollMs, remaining));
      if (opts.signal?.aborted) return runningResult;

      let runs;
      try {
        runs = await store.listRuns(prId);
      } catch (err) {
        if (err instanceof RateLimited && !rateLimitedOnce) {
          rateLimitedOnce = true;
          pollMs = pollMs * 2;
          continue;
        }
        throw err;
      }

      const elapsedS = totalS - Math.round((deadline - Date.now()) / 1000);
      opts.onProgress?.(Math.max(0, elapsedS), totalS);

      const current = runs.find((r) => r.run_id === runId);
      if (!current) continue; // not yet visible to a list read; keep polling

      if (current.status === 'done') {
        let reviews = await store.listReviews(prId);
        let match = reviews.find((r) => r.run_id === runId);
        if (!match) {
          // Briefly absent right at the done/insert boundary — re-poll once.
          await sleep(pollMsBase);
          reviews = await store.listReviews(prId);
          match = reviews.find((r) => r.run_id === runId);
        }
        if (!match) return runningResult;

        const payload = buildFindingsPayload([match], { limit: FINDINGS_LIMIT, detail: 'summary' });
        return {
          status: 'done',
          pr: prLabel,
          agent: agent.name,
          run_id: runId,
          verdict: payload.verdict,
          score: match.score,
          counts: payload.counts,
          findings: payload.findings as SummaryFindingItem[],
          more: payload.more,
        };
      }

      if (current.status === 'failed' || current.status === 'cancelled') {
        throw new RunFailed(runId, current.status, current.error);
      }
      // else running/pending — keep polling
    }

    return runningResult;
  }
}
