import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { makeApp } from './evals-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

type Estimate = { agent_id: string; avg_duration_ms: number | null; avg_cost_usd: number | null };

d('GET /agents/run-estimates (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const agentRow = (ws: string, name: string) => ({
    workspaceId: ws,
    name,
    provider: 'openai' as const,
    model: 'gpt-4.1',
    systemPrompt: 's',
  });

  it('AC-11: mean of the last 10 durations, mean of the 8 known costs; older and non-done runs are ignored', async () => {
    const db = pg.handle.db;
    const [agent] = await db.insert(t.agents).values(agentRow(workspaceId, 'Estimated')).returning();
    // Run history is on one PR; ran_at is explicit so "last 10" is unambiguous.
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'est', fullName: 'acme/est' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: repo!.id, number: 1, title: 'PR', author: 'a', branch: 'b', base: 'main', headSha: 's', status: 'needs_review' })
      .returning();
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    const base = { workspaceId, agentId: agent!.id, prId: pr!.id, source: 'local' as const };

    // The 10 newest done runs: durations 6000, 6333, … 9000; costs known on 8, null on 2.
    const durations = Array.from({ length: 10 }, (_, i) => 6000 + Math.round((i * 3000) / 9));
    const costs: (number | null)[] = [0.1, 0.2, null, 0.3, 0.4, null, 0.5, 0.6, 0.7, 0.8];
    for (let i = 0; i < 10; i++) {
      await db.insert(t.agentRuns).values({ ...base, status: 'done', durationMs: durations[i]!, costUsd: costs[i]!, ranAt: at(i + 1) });
    }
    // Outside the window, failed and running runs must not move the averages.
    await db.insert(t.agentRuns).values({ ...base, status: 'done', durationMs: 999_999, costUsd: 99, ranAt: at(500) });
    await db.insert(t.agentRuns).values({ ...base, status: 'failed', durationMs: 0, costUsd: null, ranAt: at(0.5) });
    await db.insert(t.agentRuns).values({ ...base, status: 'running', ranAt: at(0.2) });

    const app = await makeApp(pg);
    const res = await app.inject({ method: 'GET', url: '/agents/run-estimates' });
    expect(res.statusCode).toBe(200);
    const est = (res.json() as Estimate[]).find((e) => e.agent_id === agent!.id)!;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(est.avg_duration_ms).toBeCloseTo(mean(durations), 5);
    expect(est.avg_cost_usd).toBeCloseTo(mean(costs.filter((c): c is number => c !== null)), 8);
    await app.close();
  });

  it('AC-11: an agent with no done run → both values null; every workspace agent is listed, others are not', async () => {
    const db = pg.handle.db;
    const [fresh] = await db.insert(t.agents).values(agentRow(workspaceId, 'No history')).returning();
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'Estimates other' }).returning();
    const [foreign] = await db.insert(t.agents).values(agentRow(otherWs!.id, 'Foreign')).returning();

    const app = await makeApp(pg);
    const list = (await app.inject({ method: 'GET', url: '/agents/run-estimates' })).json() as Estimate[];
    const mine = list.find((e) => e.agent_id === fresh!.id)!;
    expect(mine.avg_duration_ms).toBeNull();
    expect(mine.avg_cost_usd).toBeNull();
    expect(list.some((e) => e.agent_id === foreign!.id)).toBe(false);
    const workspaceAgents = (await app.inject({ method: 'GET', url: '/agents' })).json() as { id: string }[];
    expect(list.map((e) => e.agent_id)).toEqual(workspaceAgents.map((a) => a.id));
    await app.close();
  });

  it('a done run with every cost unknown → avg_cost_usd null, duration still averaged', async () => {
    const db = pg.handle.db;
    const [agent] = await db.insert(t.agents).values(agentRow(workspaceId, 'Unpriced')).returning();
    await db.insert(t.agentRuns).values({ workspaceId, agentId: agent!.id, status: 'done', durationMs: 4000, costUsd: null });
    const app = await makeApp(pg);
    const est = ((await app.inject({ method: 'GET', url: '/agents/run-estimates' })).json() as Estimate[]).find(
      (e) => e.agent_id === agent!.id,
    )!;
    expect(est.avg_duration_ms).toBe(4000);
    expect(est.avg_cost_usd).toBeNull();
    await app.close();
  });
});
