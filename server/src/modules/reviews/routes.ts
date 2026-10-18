import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RunRequest, SmartDiff } from '@devdigest/shared';
import type { IntentDeriveResult, PrIntentRecord, RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { ReviewService } from './service.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentIds}                → run review(s); returns runs (+ multi_agent_run_id for 2+)
 *   GET    /multi-runs/:id                              → one multi-agent run: runs, reviews, finding groups (no model call)
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /pulls/:id/reviews                          → persisted reviews + findings for a PR
 *   POST   /findings/:id/(accept|dismiss)              → finding actions
 *   GET    /pulls/:id/intent                            → stored intent (or null); `stale` vs head_sha
 *   POST   /pulls/:id/intent/derive                     → always re-derive intent (spends money)
 *   GET    /pulls/:id/smart-diff                          → reviewer-ordered diff (core/tests/wiring/docs/boilerplate; no model call)
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // The body is deliberately NOT schema-validated by Fastify (that would answer
  // 422 `validation_error`): the handler parses `RunRequest` itself so every
  // malformed request — missing/empty `agentIds`, the removed `agentId`/`all`
  // fields (`.strict()`), a bad uuid — gets the spec's 400 `invalid_run_request`.
  app.post(
    '/pulls/:id/review',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const parsed = RunRequest.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError(
        'invalid_run_request',
        'Provide agentIds: a non-empty list of agent ids',
        400,
      );
    }
    const targets = await service.resolveTargets(workspaceId, parsed.data.agentIds);
    const { runs, reviews, multi_agent_run_id } = await service.runReview(
      workspaceId,
      req.params.id,
      targets,
      req.log,
    );
    return { pr_id: req.params.id, runs, reviews, ...(multi_agent_run_id ? { multi_agent_run_id } : {}) };
  });

  // ---- One multi-agent run (runs + reviews + finding groups; no model call) --
  app.get('/multi-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getMultiRun(workspaceId, req.params.id);
  });

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    await getContext(container, req);
    const runId = req.params.id;

    reply.sse(
      (async function* () {
        // Bridge the in-memory RunBus to an async iterator the SSE plugin drains.
        const queue: RunEvent[] = [];
        let resolve: (() => void) | null = null;
        let done = false;

        const unsubscribe = container.runBus.subscribe(runId, (e) => {
          queue.push(e);
          resolve?.();
        });
        const offDone = container.runBus.onDone(runId, () => {
          done = true;
          resolve?.();
        });

        try {
          while (true) {
            if (queue.length === 0) {
              if (done) break;
              await new Promise<void>((r) => (resolve = r));
              resolve = null;
              continue;
            }
            const e = queue.shift()!;
            yield {
              id: String(e.seq),
              event: e.kind,
              data: JSON.stringify(e),
            };
          }
        } finally {
          unsubscribe();
          offDone();
        }
      })(),
    );
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get('/pulls/:id/runs/active', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  });

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get('/pulls/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    await service.cancelRun(req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    const trace = await service.getRunTrace(req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Reads --------------------------------------------------------------
  app.get('/pulls/:id/reviews', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  });

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Finding actions (accept / dismiss) ---------------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(`/findings/:id/${action}`, { schema: { params: IdParams } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.actOnFinding(workspaceId, req.params.id, action);
      return result;
    });
  }

  // ---- Intent Layer ---------------------------------------------------------
  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req): Promise<PrIntentRecord | null> => {
      const { workspaceId } = await getContext(container, req);
      return service.getIntent(workspaceId, req.params.id);
    },
  );

  // Spends money (one classifier call) — same rate-limit guard as POST /review.
  app.post(
    '/pulls/:id/intent/derive',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<IntentDeriveResult> => {
      const { workspaceId } = await getContext(container, req);
      return service.deriveIntent(workspaceId, req.params.id, req.log);
    },
  );

  // ---- Smart Diff ---------------------------------------------------------
  // Deterministic, recomputed on every read — no model call, so no rate limit
  // (this endpoint spends no money).
  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiff } } },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(container, req);
      return service.getSmartDiff(workspaceId, req.params.id, req.log);
    },
  );
}
