import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { EvalsRepository } from '../src/modules/evals/repository.js';
import { parseUnifiedDiff } from '../src/lib/diff-parser.js';
import {
  CONFIG_PATCH,
  USERS_PATCH,
  createAgent,
  defaultWorkspaceId,
  diffFor,
  makeApp,
  seedFinding,
  seedPr,
  seedReview,
} from './evals-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[evals-cases] Docker not available — skipping integration tests.');
}

/** Eval cases: from a finding, by hand, edit, delete, list (SPEC-0003). */
d('eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let ws: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ws = await defaultWorkspaceId(pg.handle.db);
    app = await makeApp(pg);
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const db = () => pg.handle.db;
  const fromFinding = (id: string, payload: object = {}) =>
    app.inject({ method: 'POST', url: `/findings/${id}/eval-case`, payload });
  const listCases = async (agentId: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json() as {
      id: string;
      name: string;
      input_diff: string;
      expected_output: { kind: string; file: string; start_line: number; end_line: number };
      title: string | null;
      severity: string | null;
      category: string | null;
      source_finding_id: string | null;
      latest_result: unknown;
    }[];
  const caseCount = async () => (await db().select().from(t.evalCases)).length;

  /** An agent, a PR with one stored config.ts patch and a review by that agent. */
  async function world(files = [{ path: 'src/config.ts', patch: CONFIG_PATCH as string | null }]) {
    const agent = await createAgent(app);
    const pr = await seedPr(db(), ws, files);
    const rev = await seedReview(db(), ws, pr.id, agent.id);
    return { agent, pr, rev };
  }

  describe('from a finding', () => {
    it('AC-1/AC-3/AC-4: an accepted finding becomes a must_find case with the headered patch and a label snapshot', async () => {
      const { agent, pr, rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, end: 12, decision: 'accepted', title: 'Hardcoded key' });
      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.created).toBe(true);
      expect(body.case).toMatchObject({
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Hardcoded key',
        expected_output: { kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 12 },
        source_finding_id: f.id,
        title: 'Hardcoded key',
        severity: 'CRITICAL',
        category: 'security',
        latest_result: null,
      });
      expect(body.case.input_diff.startsWith('diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@')).toBe(true);
      const parsed = parseUnifiedDiff(body.case.input_diff);
      expect(parsed.files.map((x) => x.path)).toEqual(['src/config.ts']);
      expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toEqual([10, 11, 12]);

      // Later PR re-syncs rewrite pr_files; the stored case does not move (AC-3).
      await db().delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      await db().insert(t.prFiles).values({ prId: pr.id, path: 'src/config.ts', patch: '@@ -1,1 +1,2 @@\n a\n+b' });
      const [stored] = await listCases(agent.id);
      expect(stored!.input_diff).toBe(body.case.input_diff);
    });

    it('AC-2: a dismissed finding becomes a must_not_flag case', async () => {
      const { rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'dismissed' });
      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(201);
      expect(res.json().case.expected_output).toMatchObject({ kind: 'must_not_flag', start_line: 11, end_line: 11 });
    });

    it('EC-15/EC-1: an undecided finding needs a kind (422, nothing stored), then takes the chosen one', async () => {
      const { rev, agent } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11 });
      const before = await caseCount();
      const bad = await fromFinding(f.id);
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error.code).toBe('validation_error');
      expect((await fromFinding(f.id, { kind: 'nope' })).statusCode).toBe(422);
      expect(await caseCount()).toBe(before);

      const ok = await fromFinding(f.id, { kind: 'must_not_flag' });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().case.expected_output.kind).toBe('must_not_flag');
      expect((await listCases(agent.id))).toHaveLength(1);
    });

    it('EC-15: a body kind never overrides the decision of a decided finding', async () => {
      const { rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      const res = await fromFinding(f.id, { kind: 'must_not_flag' });
      expect(res.json().case.expected_output.kind).toBe('must_find');
    });

    it('EC-2: a second request returns the existing case, nothing new is stored', async () => {
      const { rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      const first = await fromFinding(f.id);
      const before = await caseCount();
      const second = await fromFinding(f.id);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ created: false, case: { id: first.json().case.id } });
      expect(await caseCount()).toBe(before);
      // Two concurrent first requests also end with one case.
      const g = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 12, decision: 'accepted' });
      const both = await Promise.all([fromFinding(g.id), fromFinding(g.id)]);
      expect(both.map((r) => r.json().case.id)[0]).toBe(both[1]!.json().case.id);
      expect(both.filter((r) => r.json().created)).toHaveLength(1);
    });

    it('EC-3: the seeded review has no producing agent: 409 naming the reason, nothing stored', async () => {
      const [seeded] = await db().select().from(t.findings).where(eq(t.findings.title, 'Hardcoded Stripe secret key in commit'));
      const before = await caseCount();
      const res = await fromFinding(seeded!.id, { kind: 'must_find' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toMatch(/no producing agent/);
      expect(await caseCount()).toBe(before);
    });

    it('EC-4: no stored patch for the file: 409 "no diff available for <file>"', async () => {
      const { rev } = await world([{ path: 'src/nopatch.ts', patch: null }]);
      const f = await seedFinding(db(), rev.id, { file: 'src/nopatch.ts', start: 3, decision: 'accepted' });
      const before = await caseCount();
      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toBe('no diff available for src/nopatch.ts');
      expect(await caseCount()).toBe(before);
    });

    it('EC-22: a re-synced patch whose hunks miss the finding: 409 "diff changed since the review"', async () => {
      const { rev } = await world([{ path: 'src/config.ts', patch: '@@ -30,4 +30,6 @@\n a\n+b\n c' }]);
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 12, decision: 'accepted' });
      const before = await caseCount();
      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toMatch(/diff changed since the review/);
      expect(await caseCount()).toBe(before);
    });

    it('security: a finding whose end_line exceeds 1,000,000 is a 409, nothing stored, and the case list still loads', async () => {
      const { rev, agent } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, end: 1_000_001, decision: 'accepted' });
      const before = await caseCount();
      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toBe('finding line range is out of bounds for an eval case');
      expect(await caseCount()).toBe(before);
      expect(await listCases(agent.id)).toHaveLength(0);
    });

    it('EC-23: duplicate file rows: the same intersecting row (lowest id) is chosen whatever the insert order', async () => {
      const agent = await createAgent(app);
      const pr = await seedPr(db(), ws, []);
      const rev = await seedReview(db(), ws, pr.id, agent.id);
      const stale = '@@ -30,4 +30,6 @@\n s\n+stale\n s';
      const goodA = CONFIG_PATCH;
      const goodB = CONFIG_PATCH.replace('sk_live_xxx', 'sk_live_BBB');
      // Inserted in reverse id order, stale row first.
      await db().insert(t.prFiles).values([
        { id: '00000000-0000-0000-0000-00000000000c', prId: pr.id, path: 'src/config.ts', patch: stale },
        { id: '00000000-0000-0000-0000-00000000000b', prId: pr.id, path: 'src/config.ts', patch: goodB },
        { id: '00000000-0000-0000-0000-00000000000a', prId: pr.id, path: 'src/config.ts', patch: goodA },
      ]);
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(201);
      expect(res.json().case.input_diff).toContain('sk_live_xxx');
      expect(res.json().case.input_diff).not.toContain('sk_live_BBB');
      expect((await fromFinding(f.id)).json().case.input_diff).toBe(res.json().case.input_diff);
    });

    it('EC-21: a deleted agent is a 409; another workspace is a 404', async () => {
      const { rev } = await world();
      const ghostRev = await seedReview(db(), ws, rev.prId, '00000000-0000-0000-0000-0000000000aa');
      const f1 = await seedFinding(db(), ghostRev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      const gone = await fromFinding(f1.id);
      expect(gone.statusCode).toBe(409);
      expect(gone.json().error.message).toMatch(/no longer exists/);

      const [otherWs] = await db().insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
      // The finding's review in another workspace.
      const otherAgent = await new AgentsRepository(db()).insert({ workspaceId: otherWs!.id, name: 'Foreign', provider: 'openai', model: 'm', systemPrompt: 'x' });
      const otherPr = await seedPr(db(), otherWs!.id, [{ path: 'src/config.ts', patch: CONFIG_PATCH }]);
      const otherRev = await seedReview(db(), otherWs!.id, otherPr.id, otherAgent.id);
      const f2 = await seedFinding(db(), otherRev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      expect((await fromFinding(f2.id)).statusCode).toBe(404);
      // The review in this workspace names an agent of another workspace.
      const crossRev = await seedReview(db(), ws, rev.prId, otherAgent.id);
      const f3 = await seedFinding(db(), crossRev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      expect((await fromFinding(f3.id)).statusCode).toBe(404);
      expect((await fromFinding('00000000-0000-0000-0000-0000000000bb')).statusCode).toBe(404);
    });

    const decide = (id: string, action: 'accept' | 'dismiss') =>
      app.inject({ method: 'POST', url: `/findings/${id}/${action}` });

    it('EC-11 (revised): a case created must_find, then the finding rejected → POST returns the case with must_not_flag (200, created:false)', async () => {
      const { rev, agent } = await world();
      // Undecided at first: the old picker stored must_find.
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, end: 12 });
      const first = await fromFinding(f.id, { kind: 'must_find' });
      expect(first.statusCode).toBe(201);
      expect((await decide(f.id, 'dismiss')).statusCode).toBe(200);

      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        created: false,
        case: {
          id: first.json().case.id,
          expected_output: { kind: 'must_not_flag', file: 'src/config.ts', start_line: 11, end_line: 12 },
        },
      });
      const cases = await listCases(agent.id);
      expect(cases).toHaveLength(1);
      expect(cases[0]!.expected_output).toEqual({ kind: 'must_not_flag', file: 'src/config.ts', start_line: 11, end_line: 12 });
      // Asking again with matching kinds returns the same case.
      expect((await fromFinding(f.id)).json()).toMatchObject({ created: false, case: { expected_output: { kind: 'must_not_flag' } } });
    });

    it('EC-11 (revised): a case created must_not_flag, then the finding accepted → POST returns the case with must_find', async () => {
      const { rev, agent } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'dismissed' });
      const first = await fromFinding(f.id);
      expect(first.json().case.expected_output.kind).toBe('must_not_flag');
      await decide(f.id, 'accept');

      const res = await fromFinding(f.id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        created: false,
        case: { id: first.json().case.id, expected_output: { kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 } },
      });
      expect((await listCases(agent.id))[0]!.expected_output.kind).toBe('must_find');
    });

    it('EC-11 (revised): an undecided finding returns its existing case unchanged', async () => {
      const { rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11 });
      await fromFinding(f.id, { kind: 'must_find' });
      const res = await fromFinding(f.id, { kind: 'must_not_flag' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ created: false, case: { expected_output: { kind: 'must_find' } } });
    });

    it('EC-11 (revised): two concurrent requests after the flip both see the decided kind', async () => {
      const { rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11 });
      await fromFinding(f.id, { kind: 'must_find' });
      await decide(f.id, 'dismiss');
      const both = await Promise.all([fromFinding(f.id), fromFinding(f.id)]);
      expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(both.map((r) => r.json().case.expected_output.kind)).toEqual(['must_not_flag', 'must_not_flag']);
    });

    it('EC-11 (revised): the update is workspace-scoped: another workspace cannot change a case kind', async () => {
      const { rev } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      const made = (await fromFinding(f.id)).json().case.id as string;
      const [otherWs] = await db().insert(t.workspaces).values({ name: `scope-${Date.now()}` }).returning();
      const repo = new EvalsRepository(db());
      expect(await repo.setCaseKind(otherWs!.id, made, 'must_not_flag')).toBeUndefined();
      const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, made));
      expect(row!.expectedOutput).toMatchObject({ kind: 'must_find' });
    });

    it('AC-31: past run results keep the old expectation after the flip', async () => {
      const { rev, agent } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11 });
      const caseId = (await fromFinding(f.id, { kind: 'must_find' })).json().case.id as string;
      expect((await app.inject({ method: 'POST', url: `/eval-cases/${caseId}/run` })).statusCode).toBe(200);
      const before = await db().select().from(t.evalRuns).where(eq(t.evalRuns.caseId, caseId));
      expect(before).toHaveLength(1);
      expect(before[0]!.expected).toMatchObject({ kind: 'must_find' });

      await decide(f.id, 'dismiss');
      expect((await fromFinding(f.id)).json().case.expected_output.kind).toBe('must_not_flag');

      const after = await db().select().from(t.evalRuns).where(eq(t.evalRuns.caseId, caseId));
      expect(after).toHaveLength(1);
      expect(after[0]!.id).toBe(before[0]!.id);
      expect(after[0]!.expected).toEqual(before[0]!.expected);
      expect(after[0]!.pass).toBe(before[0]!.pass);
      // The live case's latest result still shows the snapshot taken at run time.
      expect((await listCases(agent.id))[0]!.latest_result).toMatchObject({ expected_output: { kind: 'must_find' } });
    });

    it('EC-24: deleting the source finding or its review keeps the case, with no source link', async () => {
      const { rev, agent } = await world();
      const f = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      await fromFinding(f.id);
      await db().delete(t.findings).where(eq(t.findings.id, f.id));
      let cases = await listCases(agent.id);
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({ source_finding_id: null, title: expect.any(String) });

      const second = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 12, decision: 'dismissed' });
      await fromFinding(second.id);
      await db().delete(t.reviews).where(eq(t.reviews.id, rev.id));
      cases = await listCases(agent.id);
      expect(cases).toHaveLength(2);
      expect(cases.every((c) => c.source_finding_id === null)).toBe(true);
    });

    it('EC-24: a case whose source finding and review were deleted still runs and is scored', async () => {
      const { rev, agent } = await world();
      const found = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 11, decision: 'accepted' });
      const quiet = await seedFinding(db(), rev.id, { file: 'src/config.ts', start: 12, decision: 'dismissed' });
      const a = (await fromFinding(found.id)).json().case.id as string;
      const b = (await fromFinding(quiet.id)).json().case.id as string;
      await db().delete(t.findings).where(eq(t.findings.id, found.id));
      await db().delete(t.reviews).where(eq(t.reviews.id, rev.id));

      // The default provider returns no findings: must_find fails, must_not_flag passes.
      const runA = await app.inject({ method: 'POST', url: `/eval-cases/${a}/run` });
      expect(runA.statusCode).toBe(200);
      expect(runA.json()).toMatchObject({ case_id: a, suite_run_id: null, pass: false, expected_count: 1, produced_count: 0 });
      const runB = await app.inject({ method: 'POST', url: `/eval-cases/${b}/run` });
      expect(runB.statusCode).toBe(200);
      expect(runB.json()).toMatchObject({ case_id: b, suite_run_id: null, pass: true });

      const cases = await listCases(agent.id);
      expect(cases.map((c) => [c.source_finding_id, (c.latest_result as { pass: boolean } | null)?.pass])).toEqual([
        [null, false],
        [null, true],
      ]);
    });
  });

  describe('by hand', () => {
    const manual = (over: object = {}) => ({
      name: 'Manual case',
      input_diff: diffFor('src/config.ts', CONFIG_PATCH),
      expected_output: { kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 },
      ...over,
    });

    it('AC-26/AC-7/EC-14: creates cases in the agent set, listed by creation order that an edit does not change', async () => {
      const agent = await createAgent(app);
      const ids: string[] = [];
      for (const name of ['one', 'two', 'three']) {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual({ name }) });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({ owner_kind: 'agent', owner_id: agent.id, name, source_finding_id: null, title: null, latest_result: null });
        ids.push(res.json().id);
      }
      await app.inject({ method: 'PUT', url: `/eval-cases/${ids[0]}`, payload: { name: 'one (edited)' } });
      const list = await listCases(agent.id);
      expect(list.map((c) => c.name)).toEqual(['one (edited)', 'two', 'three']);
    });

    it('AC-5: a bad expected_output is a 422 validation_error and stores nothing', async () => {
      const agent = await createAgent(app);
      const bads = [
        { kind: 'maybe', file: 'src/config.ts', start_line: 11, end_line: 11 },
        { kind: 'must_find', file: 'src/config.ts', start_line: 0, end_line: 11 },
        { kind: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 11 },
      ];
      for (const expected_output of bads) {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual({ expected_output }) });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      expect(await listCases(agent.id)).toHaveLength(0);
    });

    it('EC-18: a diff without a parseable hunk, or a must_find outside the hunk lines, is a 422 naming the problem', async () => {
      const agent = await createAgent(app);
      const noHunk = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual({ input_diff: 'not a diff' }) });
      expect(noHunk.statusCode).toBe(422);
      expect(noHunk.json().error.message).toMatch(/no parseable file hunk/);
      const outside = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: manual({ expected_output: { kind: 'must_find', file: 'src/config.ts', start_line: 99, end_line: 99 } }),
      });
      expect(outside.statusCode).toBe(422);
      expect(outside.json().error.message).toMatch(/do not intersect/);
      expect(await listCases(agent.id)).toHaveLength(0);
      // A must_not_flag may point outside the hunks.
      const ok = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: manual({ expected_output: { kind: 'must_not_flag', file: 'src/elsewhere.ts', start_line: 5, end_line: 6 } }),
      });
      expect(ok.statusCode).toBe(201);
    });

    it('security: start_line 1e300 is rejected (422) and does not hang', async () => {
      const agent = await createAgent(app);
      const t0 = performance.now();
      for (const expected_output of [
        { kind: 'must_find', file: 'src/config.ts', start_line: 1e300, end_line: 1e300 },
        { kind: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 1e300 },
        { kind: 'must_not_flag', file: 'src/config.ts', start_line: 1, end_line: 1_000_001 },
      ]) {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual({ expected_output }) });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      expect(performance.now() - t0).toBeLessThan(2_000);
      expect(await listCases(agent.id)).toHaveLength(0);
    });

    it('security: a diff with an empty hunk declaring 999999999 lines is rejected (422), nothing stored', async () => {
      const agent = await createAgent(app);
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: manual({ input_diff: diffFor('src/config.ts', '@@ -1 +1,999999999 @@') }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toMatch(/hunk with no body lines/);
      expect(await listCases(agent.id)).toHaveLength(0);
    });

    it('security: a deletion-only hunk declaring 16000000 new lines is rejected (422), nothing stored', async () => {
      const agent = await createAgent(app);
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: manual({
          input_diff: diffFor('src/config.ts', '@@ -1,1 +1,16000000 @@\n-x'),
          expected_output: { kind: 'must_not_flag', file: 'src/config.ts', start_line: 1, end_line: 1 },
        }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
      expect(res.json().error.message).toMatch(/declares 16000000 new-side lines/);
      expect(await listCases(agent.id)).toHaveLength(0);
    });

    it('security: a valid pure-deletion hunk (+N,0) is still accepted (201)', async () => {
      const agent = await createAgent(app);
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: manual({
          input_diff: diffFor('src/config.ts', '@@ -3,2 +3,0 @@\n-gone\n-gone2'),
          expected_output: { kind: 'must_not_flag', file: 'src/config.ts', start_line: 3, end_line: 3 },
        }),
      });
      expect(res.statusCode).toBe(201);
      expect(await listCases(agent.id)).toHaveLength(1);
    });

    it('security: oversized input_diff, name and notes, and a diff of more than 50 files, are 422', async () => {
      const agent = await createAgent(app);
      const post = (payload: object) => app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload });
      const bigDiff = diffFor('src/config.ts', CONFIG_PATCH) + '\n+' + 'x'.repeat(200_001);
      expect((await post(manual({ input_diff: bigDiff }))).statusCode).toBe(422);
      expect((await post(manual({ name: 'n'.repeat(201) }))).statusCode).toBe(422);
      expect((await post(manual({ notes: 'n'.repeat(2_001) }))).statusCode).toBe(422);
      const files = Array.from({ length: 51 }, (_, i) => diffFor(`src/f${i}.ts`, '@@ -1 +1,2 @@\n x\n+y')).join('\n');
      const tooMany = await post(manual({ input_diff: files, expected_output: { kind: 'must_not_flag', file: 'src/f0.ts', start_line: 1, end_line: 1 } }));
      expect(tooMany.statusCode).toBe(422);
      expect(tooMany.json().error.message).toMatch(/at most 50 files/);
      expect(await listCases(agent.id)).toHaveLength(0);
    });

    it('AC-27: an edit changes name and expectation, never the diff; a must_find edit is re-validated (422, unchanged)', async () => {
      const agent = await createAgent(app);
      const created = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual() })).json();
      const ok = await app.inject({
        method: 'PUT',
        url: `/eval-cases/${created.id}`,
        payload: { name: 'renamed', expected_output: { kind: 'must_not_flag', file: 'src/config.ts', start_line: 10, end_line: 12 }, input_diff: 'ignored' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ name: 'renamed', input_diff: created.input_diff, expected_output: { kind: 'must_not_flag' } });

      const bad = await app.inject({
        method: 'PUT',
        url: `/eval-cases/${created.id}`,
        payload: { expected_output: { kind: 'must_find', file: 'src/config.ts', start_line: 99, end_line: 99 } },
      });
      expect(bad.statusCode).toBe(422);
      const [after] = await listCases(agent.id);
      expect(after!.expected_output.kind).toBe('must_not_flag');
      expect((await app.inject({ method: 'PUT', url: `/eval-cases/00000000-0000-0000-0000-0000000000cc`, payload: { name: 'x' } })).statusCode).toBe(404);
    });

    it('AC-5: an update with a bad expected_output is a 422 validation_error and changes nothing', async () => {
      const agent = await createAgent(app);
      const created = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual() })).json();
      const bads = [
        { kind: 'maybe', file: 'src/config.ts', start_line: 11, end_line: 11 },
        { kind: 'must_find', file: 'src/config.ts', start_line: 0, end_line: 11 },
        { kind: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 11 },
      ];
      for (const expected_output of bads) {
        const res = await app.inject({ method: 'PUT', url: `/eval-cases/${created.id}`, payload: { name: 'changed', expected_output } });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      const [after] = await listCases(agent.id);
      expect(after).toMatchObject({ name: created.name, expected_output: created.expected_output });
    });

    it('AC-29: deleting removes the case from the set; a second delete is a 404', async () => {
      const agent = await createAgent(app);
      const created = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manual() })).json();
      const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` });
      expect(del.statusCode).toBe(200);
      expect(await listCases(agent.id)).toHaveLength(0);
      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` })).statusCode).toBe(404);
    });

    it('unknown agent: 404 on create and list; the eval set is per agent', async () => {
      const ghost = '00000000-0000-0000-0000-0000000000dd';
      expect((await app.inject({ method: 'POST', url: `/agents/${ghost}/eval-cases`, payload: manual() })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/eval-cases` })).statusCode).toBe(404);
      const a = await createAgent(app);
      const b = await createAgent(app);
      await app.inject({ method: 'POST', url: `/agents/${a.id}/eval-cases`, payload: manual({ input_diff: diffFor('src/api/users.ts', USERS_PATCH), expected_output: { kind: 'must_not_flag', file: 'src/api/users.ts', start_line: 41, end_line: 41 } }) });
      expect(await listCases(a.id)).toHaveLength(1);
      expect(await listCases(b.id)).toHaveLength(0);
    });
  });
});
