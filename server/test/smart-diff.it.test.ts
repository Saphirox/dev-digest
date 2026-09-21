/**
 * `latestFindingRangesForPull` (`docs/plans/0004-smart-diff.md` step 5) —
 * DB-backed (testcontainers Postgres), because the single-latest-row bug this
 * query exists to avoid can only be proven against a real `selectDistinctOn`.
 * With three agents reviewing one PR, a naive "latest review overall" query
 * would keep only ONE agent's findings; `latestFindingRangesForPull` must
 * keep the newest review PER AGENT.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, number: number) {
  const name = `smart-diff-pr-${number}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number,
      title: 'Smart Diff fixture PR',
      author: 'marisa.koch',
      branch: 'feat/x',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Fixture.',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('latestFindingRangesForPull (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: ReviewRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new ReviewRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function addReview(
    prId: string,
    agentId: string | null,
    kind: 'summary' | 'review',
    ageMinutesAgo: number,
    findings: { file: string; startLine: number; endLine: number }[],
  ) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId,
        runId: null,
        kind,
        verdict: null,
        summary: null,
        score: null,
        model: null,
        createdAt: new Date(Date.now() - ageMinutesAgo * 60_000),
      })
      .returning();
    if (findings.length > 0) {
      await pg.handle.db.insert(t.findings).values(
        findings.map((f) => ({
          reviewId: review!.id,
          file: f.file,
          startLine: f.startLine,
          endLine: f.endLine,
          severity: 'WARNING',
          category: 'bug',
          title: 'fixture finding',
          rationale: 'fixture',
          confidence: 0.5,
        })),
      );
    }
    return review!;
  }

  it('with three agents on one PR, returns the NEWEST review per agent — not a single latest-overall row', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 101);
    const agentA = crypto.randomUUID();
    const agentB = crypto.randomUUID();
    const agentC = crypto.randomUUID();

    // Agent A: an older review (superseded) + a newer one.
    await addReview(pr.id, agentA, 'review', 60, [{ file: 'a.ts', startLine: 1, endLine: 1 }]);
    await addReview(pr.id, agentA, 'review', 10, [{ file: 'a.ts', startLine: 2, endLine: 2 }]);
    // Agent B: one review.
    await addReview(pr.id, agentB, 'review', 30, [{ file: 'b.ts', startLine: 5, endLine: 5 }]);
    // Agent C: an older review (superseded) + a newer one.
    await addReview(pr.id, agentC, 'review', 45, [{ file: 'c.ts', startLine: 9, endLine: 9 }]);
    await addReview(pr.id, agentC, 'review', 5, [{ file: 'c.ts', startLine: 20, endLine: 20 }]);

    const ranges = await repo.latestFindingRangesForPull(pr.id);
    const byFile = new Map(ranges.map((r) => [r.file, r]));

    // A naive "one latest review overall" query would return only agent C's
    // (most recent) findings and drop A's and B's entirely.
    expect(ranges).toHaveLength(3);
    expect(byFile.get('a.ts')).toMatchObject({ startLine: 2, endLine: 2 }); // A's NEWER review, not the older one
    expect(byFile.get('b.ts')).toMatchObject({ startLine: 5, endLine: 5 });
    expect(byFile.get('c.ts')).toMatchObject({ startLine: 20, endLine: 20 }); // C's NEWER review
  });

  it("excludes kind='summary' rows even when they carry findings", async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 102);
    const agent = crypto.randomUUID();
    await addReview(pr.id, agent, 'summary', 5, [{ file: 'summary-only.ts', startLine: 1, endLine: 1 }]);

    const ranges = await repo.latestFindingRangesForPull(pr.id);
    expect(ranges.find((r) => r.file === 'summary-only.ts')).toBeUndefined();
    expect(ranges).toEqual([]);
  });

  it('a PR with no reviews returns []', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 103);
    expect(await repo.latestFindingRangesForPull(pr.id)).toEqual([]);
  });
});
