import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[pulls-cost-total] Docker not available — skipping integration tests.');
}

/**
 * The PR list's COST column is the SUM of every completed run on the PR, not
 * one run's cost: after "Review all" over N agents the column has to account
 * for the whole pass. Null stays UNKNOWN throughout — a PR with no completed
 * runs, or whose runs carry no recorded cost, reports null (rendered "—"),
 * never 0.
 */
d('GET /repos/:id/pulls — cost_usd column', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db.select().from(t.repos);
    repoId = repo!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests);
    prId = pr!.id;
    // the seed leaves no agent_runs on the PR — each test creates its own
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.prId, prId));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function addRun(status: string, costUsd: number | null) {
    await pg.handle.db.insert(t.agentRuns).values({ workspaceId, prId, status, costUsd });
  }

  async function costOfThePr(): Promise<number | null | undefined> {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    await app.close();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; cost_usd?: number | null }[];
    return body.find((p) => p.id === prId)?.cost_usd;
  }

  it('reports null — not 0 — when the PR has no runs at all', async () => {
    expect(await costOfThePr()).toBeNull();
  });

  it('sums every completed run rather than reporting the latest', async () => {
    await addRun('done', 0.001);
    await addRun('done', 0.0004);
    // 0.0014, not 0.0004 (the newest) — float-safe comparison
    expect(await costOfThePr()).toBeCloseTo(0.0014, 10);
  });

  it('ignores runs that did not complete', async () => {
    await addRun('failed', 0.05);
    await addRun('running', 0.05);
    expect(await costOfThePr()).toBeCloseTo(0.0014, 10);
  });

  it('skips null-cost runs instead of counting them as 0', async () => {
    await addRun('done', null);
    expect(await costOfThePr()).toBeCloseTo(0.0014, 10);
  });

  it('stays null when every completed run has an unrecorded cost', async () => {
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    await addRun('done', null);
    await addRun('done', null);
    expect(await costOfThePr()).toBeNull();
  });
});
