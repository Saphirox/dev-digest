import PQueue from 'p-queue';
import type { BlastRadius, PrHistory } from '@devdigest/shared';
import { NotFoundError, ExternalServiceError } from '../../platform/errors.js';
import { mergePriorPrs, pickHistoryFiles, toBlastRadius, type PerShaResult } from './helpers.js';
import { PRIOR_PR_COMMITS_PER_FILE, PRIOR_PR_CONCURRENCY } from './constants.js';
import type { BlastIndex, BlastStore, PriorPrCache, PriorPrSource } from './ports.js';

/** Minimal logger shape (Fastify's request logger satisfies this structurally). */
export interface Logger {
  info: (obj: unknown, msg?: string) => void;
}

export interface BlastServiceDeps {
  store: BlastStore;
  index: BlastIndex;
  priorPrSource: PriorPrSource;
  priorPrCache: PriorPrCache<PrHistory>;
}

/**
 * Blast Radius + Prior PRs. `getBlastRadius` is a pure read of the
 * precomputed repo-intel index (no LLM call, no clone parsing on the
 * persistent path — see repo-intel's DEGRADED CONTRACT). `getPriorPrs` is
 * the one method here that talks to GitHub, and only on cache miss.
 */
export class BlastService {
  constructor(private deps: BlastServiceDeps) {}

  async getBlastRadius(workspaceId: string, prId: string, logger?: Logger): Promise<BlastRadius> {
    const pull = await this.deps.store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.deps.store.listChangedFiles(prId);
    const paths = files.map((f) => f.path);

    const [result, indexedSha] = await Promise.all([
      this.deps.index.getBlastRadius(pull.repoId, paths),
      this.deps.index.getIndexedSha(pull.repoId),
    ]);
    const blast = toBlastRadius(result, indexedSha);

    const source =
      blast.reason === 'flag_off'
        ? 'none'
        : !blast.degraded || blast.reason === 'index_partial'
          ? 'precomputed_index'
          : 'fallback';

    logger?.info(
      {
        prId,
        changedSymbols: blast.changed_symbols.length,
        downstream: blast.downstream.length,
        degraded: blast.degraded ?? false,
        reason: blast.reason,
        source,
      },
      'blast: read precomputed repo-intel index',
    );
    return blast;
  }

  async getPriorPrs(workspaceId: string, prId: string, logger?: Logger): Promise<PrHistory> {
    const pull = await this.deps.store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const cacheKey = `${prId}:${pull.headSha}`;
    const cached = this.deps.priorPrCache.get(cacheKey);
    if (cached) return cached;

    const repo = await this.deps.store.findRepo(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Resolve the GitHub port ONCE, before any per-call retry loop. A missing
    // token throws the container's own `ConfigError` here, so it propagates
    // directly instead of being counted as just another failed call below.
    const github = await this.deps.priorPrSource.resolve();

    const files = await this.deps.store.listChangedFiles(prId);
    const paths = pickHistoryFiles(files);

    // path → shas (capped per file); a shared reverse map (sha → files) lets
    // one commit found via two files attribute its PR's overlap to both.
    const shaFiles = new Map<string, Set<string>>();
    let totalCalls = 0;
    let totalFailures = 0;

    for (const path of paths) {
      totalCalls++;
      try {
        const shas = await github.listCommitShasForPath(repo, path, PRIOR_PR_COMMITS_PER_FILE);
        for (const sha of shas) {
          const set = shaFiles.get(sha) ?? new Set<string>();
          set.add(path);
          shaFiles.set(sha, set);
        }
      } catch {
        totalFailures++;
      }
    }

    const shas = [...shaFiles.keys()];
    const perSha: PerShaResult[] = [];
    const queue = new PQueue({ concurrency: PRIOR_PR_CONCURRENCY });
    await Promise.all(
      shas.map((sha) =>
        queue.add(async () => {
          totalCalls++;
          try {
            const prs = await github.listPullsForCommit(repo, sha);
            perSha.push({ files: [...(shaFiles.get(sha) ?? [])], prs });
          } catch {
            totalFailures++;
          }
        }),
      ),
    );

    if (totalCalls > 0 && totalFailures === totalCalls) {
      throw new ExternalServiceError('GitHub was unreachable for every sampled file/commit');
    }

    const history = mergePriorPrs(perSha, pull.number);
    const result: PrHistory = { history };
    this.deps.priorPrCache.set(cacheKey, result);

    logger?.info(
      { prId, files: paths.length, shas: shas.length, failures: totalFailures, prs: history.length },
      'blast: prior PRs computed',
    );
    return result;
  }
}
