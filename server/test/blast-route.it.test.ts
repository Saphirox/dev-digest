/**
 * `GET /pulls/:id/blast` and `GET /pulls/:id/prior-prs` end to end
 * (Testcontainers pg). Modelled on `test/smart-diff-route.it.test.ts`: seed
 * `pr_files` directly, inject a fake `repoIntel` + a `MockGitHubClient` via
 * `buildApp({ overrides })`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import type { RepoIntel, BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A fake RepoIntel facade: only getBlastRadius/getIndexState are exercised. */
function fakeRepoIntel(opts: { blast: BlastResult; indexedSha: string | null }): RepoIntel {
  const calls: string[][] = [];
  const state: IndexState = {
    repoId: 'r1',
    status: 'partial',
    filesIndexed: 5,
    filesSkipped: 0,
    durationMs: 10,
    lastIndexedSha: opts.indexedSha ?? '',
    indexerVersion: 2,
    updatedAt: new Date(),
  };
  return {
    indexRepo: async () => ({ status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    refreshIndex: async () => ({ status: 'full', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    getIndexState: async () => state,
    getBlastRadius: async (_repoId, files) => {
      calls.push(files);
      return opts.blast;
    },
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
    // exposed for assertions
    __calls: calls,
  } as unknown as RepoIntel & { __calls: string[][] };
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-route-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 800,
      title: 'Blast route fixture PR',
      author: 'marisa.koch',
      branch: 'feat/blast-fixture',
      base: 'main',
      headSha: 'sha-blast-1',
      additions: 5,
      deletions: 0,
      filesCount: 2,
      status: 'needs_review',
      body: 'Fixture PR for blast route tests.',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/rate-limit.ts', additions: 10, deletions: 2, patch: '@@ -1,1 +1,2 @@\n ctx\n+change' },
    { prId: pr!.id, path: 'src/other.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n ctx\n+change' },
  ]);
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/blast + /pulls/:id/prior-prs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('200s with a body that parses as BlastRadius; the changed paths reach the fake; degraded:index_partial survives', async () => {
    const repoIntel = fakeRepoIntel({
      indexedSha: 'sha-idx-1',
      blast: {
        changedSymbols: [{ file: 'src/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
        callers: [{ file: 'src/handler.ts', symbol: 'handle', viaSymbol: 'rateLimit', line: 12, rank: 3 }],
        impactedEndpoints: ['GET /x'],
        factsByFile: { 'src/handler.ts': { endpoints: ['GET /x'], crons: [] } },
        degraded: true,
        reason: 'index_partial',
      },
    });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadius.parse(res.json());
    expect(parsed.degraded).toBe(true);
    expect(parsed.reason).toBe('index_partial');
    expect(parsed.downstream[0]!.callers[0]!.file).toBe('src/handler.ts');

    const calls = (repoIntel as unknown as { __calls: string[][] }).__calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.arrayContaining(['src/rate-limit.ts', 'src/other.ts']));

    await app.close();
  });

  it('unknown PR id → 404 on both routes', async () => {
    const repoIntel = fakeRepoIntel({ indexedSha: null, blast: { changedSymbols: [], callers: [], impactedEndpoints: [] } });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel } });
    const missing = '00000000-0000-0000-0000-000000000000';

    const blastRes = await app.inject({ method: 'GET', url: `/pulls/${missing}/blast` });
    expect(blastRes.statusCode).toBe(404);

    const historyRes = await app.inject({ method: 'GET', url: `/pulls/${missing}/prior-prs` });
    expect(historyRes.statusCode).toBe(404);

    await app.close();
  });

  it('prior-prs: parses as PrHistory, and a second call makes 0 new mock GitHub calls (cache hit)', async () => {
    const repoIntel = fakeRepoIntel({ indexedSha: null, blast: { changedSymbols: [], callers: [], impactedEndpoints: [] } });
    const github = new MockGitHubClient({
      commitsByPath: { 'src/rate-limit.ts': ['sha-a'], 'src/other.ts': [] },
      pullsBySha: {
        'sha-a': [{ number: 401, title: 'Prior work', author: 'someone', merged_at: '2026-01-01T00:00:00Z' }],
      },
    });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel, github } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const first = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/prior-prs` });
    expect(first.statusCode).toBe(200);
    const parsed = PrHistory.parse(first.json());
    expect(parsed.history.map((h) => h.pr_number)).toEqual([401]);

    const callsAfterFirst = github.listCommitShasForPathCalls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/prior-prs` });
    expect(second.statusCode).toBe(200);
    expect(github.listCommitShasForPathCalls.length).toBe(callsAfterFirst); // 0 new calls
    expect(github.listPullsForCommitCalls.length).toBeGreaterThan(0);

    await app.close();
  });
});
