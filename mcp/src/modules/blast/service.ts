import type { BlastStore, BlastRadiusRecord } from './ports.js';
import type { Resolver } from '../_shared/resolver.js';
import { ApiFailure } from '../../platform/errors.js';

export interface GetBlastRadiusInput {
  repo: string;
  pr: number;
}

export interface GetBlastRadiusResult {
  pr: string;
  blast: BlastRadiusRecord;
}

export interface BlastServiceDeps {
  store: BlastStore;
  resolver: Resolver;
}

/**
 * `blast` service. Constructor takes a named deps type (dependency
 * inversion), consistently with `AgentsServiceDeps`/`ReviewsServiceDeps`/
 * `ConventionsServiceDeps`.
 */
export class BlastService {
  constructor(private readonly deps: BlastServiceDeps) {}

  /**
   * `get_blast_radius` — resolves repo + PR (like `ReviewsService`, which
   * also needs both), then reads the precomputed blast-radius map. No LLM
   * cost, read-only.
   */
  async getBlastRadius(input: GetBlastRadiusInput): Promise<GetBlastRadiusResult> {
    const { store, resolver } = this.deps;
    const repo = await resolver.resolveRepo(input.repo);
    const prId = await resolver.resolvePr(input.repo, repo.id, input.pr);
    const prLabel = `${repo.full_name}#${input.pr}`;

    // A cached `prId` (`resolver.resolvePr`'s process-lifetime cache) can go
    // stale if the PR is deleted after resolution; the API 404s on the first
    // call that uses it. Evict so the next call re-resolves, rather than
    // reusing a dead id forever (same pattern as `reviews/service.ts`).
    try {
      const blast = await store.getBlastRadius(prId);
      return { pr: prLabel, blast };
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 404) resolver.invalidatePr(input.repo, input.pr);
      throw err;
    }
  }
}
