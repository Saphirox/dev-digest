/**
 * PullsRepository's read-time rollups against real Postgres: the SQL does the
 * grouping now, so its NULL semantics and filters are pinned here rather than
 * in the service's unit tests. Each test gets its own repo + PR.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[pulls-repository] Docker not available — skipping integration tests.');
}

d('PullsRepository rollups', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: PullsRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new PullsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(): Promise<string> {
    const name = `rollup-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: r!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'h',
      })
      .returning();
    return pr!.id;
  }

  async function addReview(prId: string, score: number, createdAt: Date): Promise<string> {
    const [rv] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', score, createdAt })
      .returning();
    return rv!.id;
  }

  async function addFinding(reviewId: string, severity: string, dismissed = false) {
    await pg.handle.db.insert(t.findings).values({
      reviewId,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity,
      category: 'bug',
      title: 'x',
      rationale: 'y',
      confidence: 0.9,
      dismissedAt: dismissed ? new Date() : null,
    });
  }

  it('latestScores returns the newest review score per PR', async () => {
    const prId = await newPr();
    await addReview(prId, 40, new Date('2026-01-01'));
    await addReview(prId, 90, new Date('2026-02-01'));
    expect((await repo.latestScores([prId])).get(prId)).toBe(90);
  });

  it('openFindingCounts groups across every review and drops dismissed findings', async () => {
    const prId = await newPr();
    const r1 = await addReview(prId, 50, new Date('2026-01-01'));
    const r2 = await addReview(prId, 60, new Date('2026-02-01'));
    await addFinding(r1, 'CRITICAL');
    await addFinding(r2, 'CRITICAL');
    await addFinding(r2, 'WARNING', true);

    const rows = await repo.openFindingCounts([prId]);

    expect(rows).toEqual([{ prId, severity: 'CRITICAL', count: 2 }]);
  });

  it('completedCostTotals sums done runs, stays null when all are unknown, omits PRs with none', async () => {
    const summed = await newPr();
    const unknown = await newPr();
    const none = await newPr();
    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: summed, status: 'done', costUsd: 0.001 },
      { workspaceId, prId: summed, status: 'done', costUsd: null },
      { workspaceId, prId: summed, status: 'failed', costUsd: 0.5 },
      { workspaceId, prId: unknown, status: 'done', costUsd: null },
    ]);

    const totals = await repo.completedCostTotals([summed, unknown, none]);

    expect(totals.get(summed)).toBeCloseTo(0.001, 10);
    expect(totals.has(unknown)).toBe(true);
    expect(totals.get(unknown)).toBeNull();
    expect(totals.has(none)).toBe(false);
  });

  it('returns empty results for an empty PR list without querying', async () => {
    expect((await repo.latestScores([])).size).toBe(0);
    expect(await repo.openFindingCounts([])).toEqual([]);
  });
});
