import { describe, it, expect } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { BoundedCache } from '../src/modules/blast/cache.js';
import { ConfigError } from '../src/platform/errors.js';
import type {
  BlastIndex,
  BlastPrFile,
  BlastPull,
  BlastRepoRef,
  BlastStore,
  PriorPrCandidate,
  PriorPrClient,
  PriorPrSource,
} from '../src/modules/blast/ports.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import type { PrHistory } from '@devdigest/shared';

/** Wraps a ready-made `PriorPrClient` as a `PriorPrSource` that resolves immediately. */
function fakePriorPrSource(client: PriorPrClient): PriorPrSource {
  return { resolve: async () => client };
}

/**
 * `BlastService` with fake ports (no DB, no network) — 404, caps/dedupe,
 * cache hit/miss, current-PR exclusion, and the partial/all-fail GitHub
 * fault tolerance.
 */

const PULL: BlastPull = { id: 'pr-1', repoId: 'repo-1', number: 500, headSha: 'sha-1' };
const REPO: BlastRepoRef = { owner: 'acme', name: 'demo' };

function fakeStore(opts: { pull?: BlastPull | undefined; files?: BlastPrFile[]; repo?: BlastRepoRef | undefined }): BlastStore {
  return {
    findPull: async () => opts.pull,
    listChangedFiles: async () => opts.files ?? [],
    findRepo: async () => opts.repo,
  };
}

const emptyBlastResult: BlastResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
};

function fakeIndex(result: BlastResult = emptyBlastResult, indexedSha: string | null = 'sha-idx'): BlastIndex {
  return {
    getBlastRadius: async () => result,
    getIndexedSha: async () => indexedSha,
  };
}

const noopLogger = { info: () => {} };

describe('BlastService.getBlastRadius', () => {
  it('throws NotFoundError for an unknown PR', async () => {
    const service = new BlastService({
      store: fakeStore({ pull: undefined }),
      index: fakeIndex(),
      priorPrSource: fakePriorPrSource({ listCommitShasForPath: async () => [], listPullsForCommit: async () => [] }),
      priorPrCache: new BoundedCache(10),
    });
    await expect(service.getBlastRadius('ws1', 'missing')).rejects.toThrow('Pull request not found');
  });

  it('returns a parsed BlastRadius shape for a known PR', async () => {
    const service = new BlastService({
      store: fakeStore({ pull: PULL, files: [{ path: 'a.ts', additions: 1, deletions: 0 }] }),
      index: fakeIndex(),
      priorPrSource: fakePriorPrSource({ listCommitShasForPath: async () => [], listPullsForCommit: async () => [] }),
      priorPrCache: new BoundedCache(10),
    });
    const blast = await service.getBlastRadius('ws1', 'pr-1', noopLogger);
    expect(blast.changed_symbols).toEqual([]);
    expect(blast.summary).toBeNull();
  });
});

describe('BlastService.getPriorPrs', () => {
  function buildService(opts: {
    files?: BlastPrFile[];
    commitsByPath?: Record<string, string[]>;
    pullsBySha?: Record<string, PriorPrCandidate[]>;
    cache?: BoundedCache<PrHistory>;
  }) {
    const calls = { commits: [] as { path: string }[], pulls: [] as { sha: string }[] };
    const priorPrSource = fakePriorPrSource({
      listCommitShasForPath: async (_repo, path, limit) => {
        calls.commits.push({ path });
        return (opts.commitsByPath?.[path] ?? []).slice(0, limit);
      },
      listPullsForCommit: async (_repo, sha) => {
        calls.pulls.push({ sha });
        return opts.pullsBySha?.[sha] ?? [];
      },
    });
    const service = new BlastService({
      store: fakeStore({ pull: PULL, files: opts.files ?? [], repo: REPO }),
      index: fakeIndex(),
      priorPrSource,
      priorPrCache: opts.cache ?? new BoundedCache(10),
    });
    return { service, calls };
  }

  it('throws NotFoundError for an unknown PR', async () => {
    const service = new BlastService({
      store: fakeStore({ pull: undefined }),
      index: fakeIndex(),
      priorPrSource: fakePriorPrSource({ listCommitShasForPath: async () => [], listPullsForCommit: async () => [] }),
      priorPrCache: new BoundedCache(10),
    });
    await expect(service.getPriorPrs('ws1', 'missing')).rejects.toThrow('Pull request not found');
  });

  it('respects the file cap (10) and commit-per-file cap (3), and dedupes SHAs across files', async () => {
    const files = Array.from({ length: 15 }, (_, i) => ({ path: `f${i}.ts`, additions: 10 - i, deletions: 0 }));
    const commitsByPath: Record<string, string[]> = {};
    for (const f of files) commitsByPath[f.path] = ['shared-sha', `${f.path}-only`, `${f.path}-extra`, `${f.path}-over-cap`];
    const { service, calls } = buildService({ files, commitsByPath, pullsBySha: {} });
    await service.getPriorPrs('ws1', 'pr-1');
    expect(calls.commits).toHaveLength(10); // file cap
    expect(calls.commits.every((c) => commitsByPath[c.path])).toBe(true);
    // 3 shas per file requested (cap), but 'shared-sha' de-dupes to one pull lookup.
    const uniqueShas = new Set(calls.pulls.map((p) => p.sha));
    expect(uniqueShas.has('shared-sha')).toBe(true);
    expect(calls.pulls.filter((p) => p.sha === 'shared-sha')).toHaveLength(1);
  });

  it('excludes the current PR and keeps only merged PRs', async () => {
    const { service } = buildService({
      files: [{ path: 'a.ts', additions: 1, deletions: 0 }],
      commitsByPath: { 'a.ts': ['sha1'] },
      pullsBySha: {
        sha1: [
          { number: 500, title: 'current', author: 'x', merged_at: '2026-01-01T00:00:00Z' },
          { number: 401, title: 'prior', author: 'y', merged_at: '2026-01-02T00:00:00Z' },
        ],
      },
    });
    const result = await service.getPriorPrs('ws1', 'pr-1');
    expect(result.history.map((h) => h.pr_number)).toEqual([401]);
  });

  it('cache hits on the same head_sha, misses on a new one', async () => {
    const cache = new BoundedCache<PrHistory>(10);
    const { service, calls } = buildService({
      files: [{ path: 'a.ts', additions: 1, deletions: 0 }],
      commitsByPath: { 'a.ts': ['sha1'] },
      pullsBySha: { sha1: [] },
      cache,
    });
    await service.getPriorPrs('ws1', 'pr-1');
    await service.getPriorPrs('ws1', 'pr-1');
    expect(calls.commits).toHaveLength(1); // second call served from cache

    // A new head_sha (different pull) misses the cache.
    const service2 = new BlastService({
      store: fakeStore({
        pull: { ...PULL, headSha: 'sha-2' },
        files: [{ path: 'a.ts', additions: 1, deletions: 0 }],
        repo: REPO,
      }),
      index: fakeIndex(),
      priorPrSource: fakePriorPrSource({
        listCommitShasForPath: async () => ['sha1'],
        listPullsForCommit: async () => [],
      }),
      priorPrCache: cache,
    });
    await service2.getPriorPrs('ws1', 'pr-1');
    expect(cache.get('pr-1:sha-1')).toBeDefined();
    expect(cache.get('pr-1:sha-2')).toBeDefined();
  });

  it('tolerates a partial GitHub failure (some shas/pulls fail, others succeed)', async () => {
    const priorPrSource = fakePriorPrSource({
      listCommitShasForPath: async (_repo, path) => {
        if (path === 'bad.ts') throw new Error('boom');
        return ['sha1'];
      },
      listPullsForCommit: async () => [{ number: 401, title: 't', author: 'a', merged_at: '2026-01-01T00:00:00Z' }],
    });
    const service = new BlastService({
      store: fakeStore({
        pull: PULL,
        files: [
          { path: 'bad.ts', additions: 5, deletions: 0 },
          { path: 'good.ts', additions: 1, deletions: 0 },
        ],
        repo: REPO,
      }),
      index: fakeIndex(),
      priorPrSource,
      priorPrCache: new BoundedCache(10),
    });
    const result = await service.getPriorPrs('ws1', 'pr-1');
    expect(result.history).toHaveLength(1);
  });

  it('throws ExternalServiceError when every GitHub call fails', async () => {
    const priorPrSource = fakePriorPrSource({
      listCommitShasForPath: async () => {
        throw new Error('down');
      },
      listPullsForCommit: async () => [],
    });
    const service = new BlastService({
      store: fakeStore({ pull: PULL, files: [{ path: 'a.ts', additions: 1, deletions: 0 }], repo: REPO }),
      index: fakeIndex(),
      priorPrSource,
      priorPrCache: new BoundedCache(10),
    });
    await expect(service.getPriorPrs('ws1', 'pr-1')).rejects.toThrow(/GitHub/);
  });

  it('propagates a ConfigError from an unresolvable GitHub port directly, not as ExternalServiceError', async () => {
    // Simulates a missing GITHUB_TOKEN: `container.github()` (routes.ts's
    // `priorPrSource.resolve`) rejects with ConfigError before any per-call
    // retry loop runs, so it must NOT be caught by the same-call failure
    // counter and re-surfaced as a generic ExternalServiceError.
    const priorPrSource: PriorPrSource = {
      resolve: async () => {
        throw new ConfigError('GITHUB_TOKEN is not configured');
      },
    };
    const service = new BlastService({
      store: fakeStore({ pull: PULL, files: [{ path: 'a.ts', additions: 1, deletions: 0 }], repo: REPO }),
      index: fakeIndex(),
      priorPrSource,
      priorPrCache: new BoundedCache(10),
    });
    await expect(service.getPriorPrs('ws1', 'pr-1')).rejects.toThrow(ConfigError);
    await expect(service.getPriorPrs('ws1', 'pr-1')).rejects.toThrow('GITHUB_TOKEN is not configured');
  });
});
