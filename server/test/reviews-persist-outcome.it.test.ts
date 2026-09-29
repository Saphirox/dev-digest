/**
 * `ReviewRepository.persistReviewOutcome` (plan 0013 Step 13/15) — the four
 * writes (insert review, insert findings, mark reviewed, complete the agent
 * run) run in ONE `db.transaction`. A mid-way NOT NULL violation
 * (`findings.file`, `db/schema/reviews.ts:34`) must leave NO review row, NO
 * findings, `pull_requests.last_reviewed_sha` unchanged, and the run still
 * `running` — never a half-persisted outcome.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Finding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('ReviewRepository.persistReviewOutcome (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: ReviewRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    repo = new ReviewRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function finding(overrides: Partial<Finding> = {}): Finding {
    return {
      id: `f-${seq}`,
      severity: 'WARNING',
      category: 'bug',
      title: 'Something off',
      file: 'src/a.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'because',
      confidence: 0.8,
      ...overrides,
    };
  }

  async function newPrWithRun(): Promise<{ prId: string; runId: string }> {
    const name = `persist-outcome-${seq++}`;
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
        headSha: 'head-sha',
        body: 'body',
        additions: 1,
        deletions: 0,
        filesCount: 1,
      })
      .returning();
    const runId = await repo.createAgentRun({
      workspaceId,
      agentId: null,
      prId: pr!.id,
      provider: 'anthropic',
      model: 'claude-x',
    });
    return { prId: pr!.id, runId };
  }

  it('happy path: inserts the review, its findings, marks reviewed, and completes the run', async () => {
    const { prId, runId } = await newPrWithRun();
    const findings = [finding({ id: 'f-a' }), finding({ id: 'f-b', file: 'src/b.ts' })];

    const outcome = await repo.persistReviewOutcome({
      review: {
        workspaceId,
        prId,
        agentId: null,
        runId,
        kind: 'review',
        verdict: 'approve',
        summary: 'looks fine',
        score: 80,
        model: 'claude-x',
      },
      findings,
      prId,
      headSha: 'new-head-sha',
      runId,
      completion: {
        status: 'done',
        durationMs: 1234,
        tokensIn: 10,
        tokensOut: 20,
        costUsd: 0.01,
        grounding: 'ok',
        score: 80,
        blockers: 0,
        error: null,
      },
    });

    expect(outcome.findings).toHaveLength(2);

    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));
    expect(pr!.lastReviewedSha).toBe('new-head-sha');

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(2);
  });

  it('a mid-way NULL-cast finding.file rejects AND leaves no review/findings, an unchanged head sha, and the run still running', async () => {
    const { prId, runId } = await newPrWithRun();
    const badFindings = [
      finding({ id: 'f-good' }),
      // `findings.file` is NOT NULL (`db/schema/reviews.ts:34`) — null-cast to
      // force the constraint mid-transaction, after a would-be-valid row.
      finding({ id: 'f-bad', file: null as unknown as string }),
    ];

    await expect(
      repo.persistReviewOutcome({
        review: {
          workspaceId,
          prId,
          agentId: null,
          runId,
          kind: 'review',
          verdict: 'approve',
          summary: 'should not stick',
          score: 50,
          model: 'claude-x',
        },
        findings: badFindings,
        prId,
        headSha: 'should-not-stick-sha',
        runId,
        completion: {
          status: 'done',
          durationMs: 1,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0,
          grounding: 'ok',
          score: 50,
          blockers: 0,
          error: null,
        },
      }),
    ).rejects.toThrow();

    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, runId));
    expect(reviews).toEqual([]);

    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));
    expect(pr!.lastReviewedSha).toBeNull();

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('running');
  });
});
