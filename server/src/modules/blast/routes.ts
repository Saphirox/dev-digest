import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';
import { BoundedCache } from './cache.js';
import { PRIOR_PR_CACHE_MAX_ENTRIES } from './constants.js';
import type { BlastIndex, PriorPrSource } from './ports.js';

/**
 * blast module.
 *   GET /pulls/:id/blast       → symbols/callers/endpoints/crons for the PR
 *                                (precomputed repo-intel index read; no LLM call)
 *   GET /pulls/:id/prior-prs   → merged PRs that touched the same top files
 *                                (named to avoid confusion with run history)
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const index: BlastIndex = {
    getBlastRadius: (repoId, files) => container.repoIntel.getBlastRadius(repoId, files),
    getIndexedSha: async (repoId) => (await container.repoIntel.getIndexState(repoId)).lastIndexedSha || null,
  };

  // One BoundedCache per plugin instance (process lifetime; not persisted —
  // see the plan's Architecture constraints on why `pr_brief` doesn't fit).
  const priorPrCache = new BoundedCache<PrHistory>(PRIOR_PR_CACHE_MAX_ENTRIES);
  const service = new BlastService({
    store: new BlastRepository(container.db),
    index,
    // Resolved lazily (per request, once — see `BlastService.getPriorPrs`) so
    // a missing GITHUB_TOKEN surfaces as the container's own ConfigError
    // instead of failing at plugin registration, and propagates directly
    // rather than being counted as a per-call GitHub failure.
    priorPrSource: {
      resolve: () => container.github(),
    } satisfies PriorPrSource,
    priorPrCache,
  });

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlastRadius(workspaceId, req.params.id, req.log);
    },
  );

  // Talks to GitHub on a cache miss — rate-limited like the other
  // money/quota-spending routes (`/pulls/:id/review`, `/intent/derive`).
  app.get(
    '/pulls/:id/prior-prs',
    {
      schema: { params: IdParams, response: { 200: PrHistory } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrHistory> => {
      const { workspaceId } = await getContext(container, req);
      return service.getPriorPrs(workspaceId, req.params.id, req.log);
    },
  );
}
