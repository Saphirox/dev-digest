/**
 * PullsService with an in-memory PullsStore — no Postgres. Pins the
 * local-first behaviour (GitHub down never fails a read), the capped diff-stat
 * backfill, and how the list's rollups are merged per PR.
 */
import { describe, it, expect } from 'vitest';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { PullsService } from '../src/modules/pulls/service.js';
import { BACKFILL_LIMIT } from '../src/modules/pulls/constants.js';
import { NotFoundError } from '../src/platform/errors.js';
import type {
  DiffStats,
  PullRecord,
  PullsStore,
  RepoRef,
  SeverityCountRow,
} from '../src/modules/pulls/ports.js';

const WS = 'ws-1';
const REPO: RepoRef = { id: 'repo-1', owner: 'acme', name: 'api' };

function pull(id: string, over: Partial<PullRecord> = {}): PullRecord {
  return {
    id,
    repoId: REPO.id,
    number: Number(id.replace(/\D/g, '')) || 1,
    title: `PR ${id}`,
    author: 'a',
    branch: 'b',
    base: 'main',
    headSha: 'h',
    lastReviewedSha: null,
    additions: 1,
    deletions: 1,
    filesCount: 1,
    status: 'open',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...over,
  };
}

class FakeStore implements PullsStore {
  pulls: PullRecord[] = [];
  upserted: PrMeta[] = [];
  statUpdates: string[] = [];
  scores = new Map<string, number | null>();
  costs = new Map<string, number | null>();
  findingRows: SeverityCountRow[] = [];
  replaced: string[] = [];

  async findRepo(workspaceId: string, repoId: string) {
    return workspaceId === WS && repoId === REPO.id ? REPO : undefined;
  }
  async findPull(workspaceId: string, prId: string) {
    return workspaceId === WS ? this.pulls.find((p) => p.id === prId) : undefined;
  }
  async upsertFromGitHub(_ws: string, _repoId: string, prs: PrMeta[]) {
    this.upserted.push(...prs);
  }
  async listByRepo() {
    return this.pulls;
  }
  async updateDiffStats(prId: string, _stats: DiffStats) {
    this.statUpdates.push(prId);
  }
  async latestScores() {
    return this.scores;
  }
  async completedCostTotals() {
    return this.costs;
  }
  async openFindingCounts() {
    return this.findingRows;
  }
  async replaceDetail(prId: string, _detail: PrDetail) {
    this.replaced.push(prId);
  }
  async loadFilesAndCommits() {
    return { files: [{ path: 'x.ts', additions: 1, deletions: 0, patch: null }], commits: [] };
  }
}

const silentLog = { warn: () => {} };
const offline = () => Promise.reject(new Error('no token'));

describe('PullsService.listForRepo', () => {
  it('404s a repo outside the workspace', async () => {
    const svc = new PullsService({ store: new FakeStore(), github: offline, log: silentLog });
    await expect(svc.listForRepo('other-ws', REPO.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('serves persisted PRs when GitHub is unavailable, without syncing or backfilling', async () => {
    const store = new FakeStore();
    store.pulls = [pull('pr-1', { additions: 0, deletions: 0, filesCount: 0 })];
    const svc = new PullsService({ store, github: offline, log: silentLog });

    const list = await svc.listForRepo(WS, REPO.id);

    expect(list.map((p) => p.id)).toEqual(['pr-1']);
    expect(store.upserted).toEqual([]);
    expect(store.statUpdates).toEqual([]);
  });

  it('syncs from GitHub and backfills at most BACKFILL_LIMIT zeroed PRs', async () => {
    const store = new FakeStore();
    store.pulls = Array.from({ length: BACKFILL_LIMIT + 3 }, (_, i) =>
      pull(`pr-${i + 1}`, { additions: 0, deletions: 0, filesCount: 0 }),
    );
    const svc = new PullsService({
      store,
      github: async () => new MockGitHubClient(),
      log: silentLog,
    });

    const list = await svc.listForRepo(WS, REPO.id);

    expect(store.upserted).toHaveLength(1);
    expect(store.statUpdates).toHaveLength(BACKFILL_LIMIT);
    // backfilled rows already carry the real numbers in this response
    expect(list[0]!.additions).toBeGreaterThan(0);
    expect(list[BACKFILL_LIMIT]!.additions).toBe(0);
  });

  it('merges score, cost and findings per PR, null where a PR has none', async () => {
    const store = new FakeStore();
    store.pulls = [pull('pr-1'), pull('pr-2')];
    store.scores.set('pr-1', 82);
    store.costs.set('pr-1', 0.0014);
    store.findingRows = [{ prId: 'pr-1', severity: 'CRITICAL', count: 2 }];
    const svc = new PullsService({ store, github: offline, log: silentLog });

    const [a, b] = await svc.listForRepo(WS, REPO.id);

    expect(a).toMatchObject({
      score: 82,
      cost_usd: 0.0014,
      findings: { CRITICAL: 2, WARNING: 0, SUGGESTION: 0 },
    });
    expect(b).toMatchObject({ score: null, cost_usd: null, findings: null });
  });
});

describe('PullsService.getDetail', () => {
  it('refreshes and persists from GitHub when reachable', async () => {
    const store = new FakeStore();
    store.pulls = [pull('pr-1')];
    const svc = new PullsService({
      store,
      github: async () => new MockGitHubClient(),
      log: silentLog,
    });

    const detail = await svc.getDetail(WS, 'pr-1');

    expect(detail.id).toBe('pr-1');
    expect(store.replaced).toEqual(['pr-1']);
  });

  it('falls back to the persisted detail when GitHub is unavailable', async () => {
    const store = new FakeStore();
    store.pulls = [pull('pr-1')];
    const svc = new PullsService({ store, github: offline, log: silentLog });

    const detail = await svc.getDetail(WS, 'pr-1');

    expect(detail.files.map((f) => f.path)).toEqual(['x.ts']);
    expect(store.replaced).toEqual([]);
  });
});
