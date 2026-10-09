import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { INJECTION_GUARD } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  CONFIG_PATCH,
  OTHER_PATCH,
  USERS_PATCH,
  ScriptedLLM,
  createAgent,
  defaultWorkspaceId,
  diffFor,
  makeApp,
  review,
  sleep,
  waitForSuiteRun,
} from './evals-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[evals-runs] Docker not available — skipping integration tests.');
}

type Expectation = { kind: 'must_find' | 'must_not_flag'; file: string; start_line: number; end_line: number };
const mustFind = (file: string, line: number): Expectation => ({ kind: 'must_find', file, start_line: line, end_line: line });
const mustNot = (file: string, line: number): Expectation => ({ kind: 'must_not_flag', file, start_line: line, end_line: line });

/**
 * Answers by what the diff in the prompt contains: the config diff yields a
 * grounded finding at config.ts:11 plus a hallucinated one at line 999 (dropped
 * by grounding); the users diff yields a finding at users.ts:41; anything else yields nothing.
 */
const scripted = (n: number, prompt: string) => {
  void n;
  if (prompt.includes('stripeKey')) {
    return review([
      { file: 'src/config.ts', start_line: 11 },
      { file: 'src/config.ts', start_line: 999 },
    ]);
  }
  if (prompt.includes('getUsers')) return review([{ file: 'src/api/users.ts', start_line: 41 }]);
  return review();
};

d('eval suite runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ws = await defaultWorkspaceId(pg.handle.db);
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function fresh() {
    const llm = new ScriptedLLM();
    llm.respond = scripted;
    const app = await makeApp(pg, { llm });
    apps.push(app);
    return { app, llm };
  }

  async function addCase(app: FastifyInstance, agentId: string, name: string, path: string, patch: string, expected: Expectation) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: { name, input_diff: diffFor(path, patch), expected_output: expected },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  /** An agent with cases A (must_find config:11), B (must_not_flag users:41), C (must_not_flag other:2). */
  async function abcAgent(app: FastifyInstance) {
    const agent = await createAgent(app);
    const a = await addCase(app, agent.id, 'A config key', 'src/config.ts', CONFIG_PATCH, mustFind('src/config.ts', 11));
    const b = await addCase(app, agent.id, 'B users', 'src/api/users.ts', USERS_PATCH, mustNot('src/api/users.ts', 41));
    const c = await addCase(app, agent.id, 'C other', 'src/other.ts', OTHER_PATCH, mustNot('src/other.ts', 2));
    return { agent, a, b, c };
  }

  const start = (app: FastifyInstance, agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const runAndWait = async (app: FastifyInstance, agentId: string) => {
    const res = await start(app, agentId);
    expect(res.statusCode).toBe(202);
    return waitForSuiteRun(app, res.json().run_id);
  };

  it('AC-9/AC-32/AC-11/AC-33/NFR-2/NFR-8: 202 at once, one review per case, a stored run with scores', async () => {
    const { app, llm } = await fresh();
    llm.delayMs = 100;
    const { agent } = await abcAgent(app);

    const res = await start(app, agent.id);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ run_id: expect.any(String), status: 'running' });
    // Not a single case has finished yet, and the list reports the run as running.
    const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: res.json().run_id, status: 'running', recall: null, cases_passed: null, cases_total: 3 });

    const run = await waitForSuiteRun(app, res.json().run_id);
    expect(run).toMatchObject({
      agent_id: agent.id,
      agent_version: 1,
      status: 'done',
      model: 'gpt-4.1',
      provider: 'openai',
      cases_total: 3,
      cases_passed: 2,
      recall: 1,
      error: null,
      failing_case: null,
    });
    expect(run.precision).toBeCloseTo(0.5, 10); // grounded: config:11 ok, users:41 noise
    expect(run.citation_accuracy).toBeCloseTo(2 / 3, 10); // 2 kept, 1 dropped (config:999)
    expect(run.cost_usd).toBeCloseTo(0.03, 10);
    expect(run.effective_prompt).toBe('ORIGINAL system prompt.');
    expect(run.case_results.map((r: { case_name: string }) => r.case_name)).toEqual(['A config key', 'B users', 'C other']);
    expect(run.case_results.map((r: { pass: boolean }) => r.pass)).toEqual([true, false, true]);
    expect(run.case_results[0]).toMatchObject({ kept_count: 1, dropped_count: 1, expected_count: 1, produced_count: 1, suite_run_id: run.id, expected_output: { kind: 'must_find', file: 'src/config.ts' } });
    expect(run.case_results[0].findings).toHaveLength(1);

    // NFR-8: exactly one engine call per case. AC-10/NFR-2: only the fixed inputs, diff wrapped.
    expect(llm.n).toBe(3);
    for (const p of llm.prompts) {
      expect(p).toContain(INJECTION_GUARD);
      expect(p).toContain('<untrusted source="diff">');
      expect(p).not.toContain('## Repo skeleton');
      expect(p).not.toContain('## Derived intent');
      expect(p).not.toContain('## PR description');
    }
  });

  it('AC-10: an agent with repo_intel on and context_paths set still sends no project context, skeleton or callers', async () => {
    const { app, llm } = await fresh();
    const agent = await createAgent(app);
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { repo_intel: true, context_paths: ['docs/architecture.md'] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ repo_intel: true, context_paths: ['docs/architecture.md'] });
    await addCase(app, agent.id, 'A config key', 'src/config.ts', CONFIG_PATCH, mustFind('src/config.ts', 11));

    const run = await runAndWait(app, agent.id);
    expect(run.status).toBe('done');
    expect(llm.prompts).toHaveLength(1);
    const [p] = llm.prompts;
    expect(p).toContain('<untrusted source="diff">');
    expect(p).not.toContain('## Project context');
    expect(p).not.toContain('## Repo skeleton');
    expect(p).not.toContain('## Callers');
  });

  it('AC-18: the dashboard shows the latest done run, its signed change against the previous one, the trend and a regression', async () => {
    const { app, llm } = await fresh();
    const { agent } = await abcAgent(app);
    const first = await runAndWait(app, agent.id);
    llm.respond = () => review(); // a "worse" prompt: finds nothing
    const second = await runAndWait(app, agent.id);
    expect(second).toMatchObject({ status: 'done', recall: 0, precision: null, citation_accuracy: null, cases_passed: 2 });

    const dash = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json();
    expect(dash.cases_total).toBe(3);
    expect(dash.current).toMatchObject({ run_id: second.id, agent_version: 1, recall: 0, precision: null, cases_passed: 2, cases_total: 3 });
    expect(dash.delta).toEqual({ recall: -1, precision: null, citation_accuracy: null });
    expect(dash.regression).toEqual({ version: 1, metrics: [{ metric: 'recall', drop_pts: 100 }] });
    expect(dash.trend.map((p: { run_id: string }) => p.run_id)).toEqual([first.id, second.id]);
    expect(dash.recent_runs.map((r: { id: string }) => r.id)).toEqual([second.id, first.id]); // newest first
  });

  it('AC-39: the period filter keeps only runs started inside it (default 30 days)', async () => {
    const { app } = await fresh();
    const { agent } = await abcAgent(app);
    const old = await runAndWait(app, agent.id);
    const recent = await runAndWait(app, agent.id);
    await db().update(t.evalSuiteRuns).set({ startedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000) }).where(eq(t.evalSuiteRuns.id, old.id));

    const ids = async (qs: string) =>
      ((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs${qs}` })).json() as { id: string }[]).map((r) => r.id);
    expect(await ids('')).toEqual([recent.id]);
    expect(await ids('?period=7d')).toEqual([recent.id]);
    expect(await ids('?period=30d')).toEqual([recent.id]);
    expect(await ids('?period=90d')).toEqual([recent.id, old.id]);
    expect(await ids('?period=all')).toEqual([recent.id, old.id]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?period=1y` })).statusCode).toBe(422);

    const dash = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?period=90d` })).json();
    expect(dash.trend.map((p: { run_id: string }) => p.run_id)).toEqual([old.id, recent.id]);
    const dash30 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?period=30d` })).json();
    expect(dash30.trend.map((p: { run_id: string }) => p.run_id)).toEqual([recent.id]);
    // The tiles still compare the two newest done runs.
    expect(dash30.current.run_id).toBe(recent.id);
    expect(dash30.delta).not.toBeNull();
  });

  it('AC-34: a case run stores a result without a suite run and leaves suite metrics alone', async () => {
    const { app, llm } = await fresh();
    const { agent, a } = await abcAgent(app);
    const none = await app.inject({ method: 'POST', url: `/eval-cases/${a.id}/run` });
    expect(none.statusCode).toBe(200);
    expect(none.json()).toMatchObject({ case_id: a.id, suite_run_id: null, pass: true, case_name: 'A config key', expected_count: 1, produced_count: 1 });
    expect(llm.n).toBe(1);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json()).toEqual([]);

    const run = await runAndWait(app, agent.id);
    llm.respond = () => review();
    const again = await app.inject({ method: 'POST', url: `/eval-cases/${a.id}/run` });
    expect(again.json().pass).toBe(false);
    expect(await waitForSuiteRun(app, run.id)).toEqual(run); // untouched
    const cases = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(cases[0].latest_result).toMatchObject({ pass: false, suite_run_id: null }); // newest result wins
    expect(cases[1].latest_result).toMatchObject({ suite_run_id: run.id });
  });

  it('EC-8: two simultaneous starts give exactly one 202; a case run is refused meanwhile', async () => {
    const { app, llm } = await fresh();
    llm.delayMs = 120;
    const { agent, a } = await abcAgent(app);
    const codes = (await Promise.all([start(app, agent.id), start(app, agent.id)])).map((r) => r.statusCode).sort();
    expect(codes).toEqual([202, 409]);
    const busy = await app.inject({ method: 'POST', url: `/eval-cases/${a.id}/run` });
    expect(busy.statusCode).toBe(409);
    const [running] = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(running.status).toBe('running');
    await waitForSuiteRun(app, running.id);
    expect(llm.n).toBe(3); // the loser never reviewed anything
    // Once it ended the agent can run again.
    const again = await start(app, agent.id);
    expect(again.statusCode).toBe(202);
    await waitForSuiteRun(app, again.json().run_id);
  });

  it('EC-5: an empty eval set is a 409 with no model call; an unknown agent is a 404', async () => {
    const { app, llm } = await fresh();
    const agent = await createAgent(app);
    expect((await start(app, agent.id)).statusCode).toBe(409);
    expect(llm.n).toBe(0);
    expect((await start(app, '00000000-0000-0000-0000-0000000000ee')).statusCode).toBe(404);
  });

  it('EC-10/EC-27/AC-31: edits mid-run change nothing for the run; earlier results survive an edit and a delete', async () => {
    const { app, llm } = await fresh();
    llm.delayMs = 150;
    const { agent, b, c } = await abcAgent(app);
    const res = await start(app, agent.id);
    while (llm.n < 1) await sleep(10);

    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'CHANGED prompt.' } });
    await app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { expected_output: mustFind('src/other.ts', 2) } });
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${b.id}` })).statusCode).toBe(200);

    const run = await waitForSuiteRun(app, res.json().run_id);
    expect(run.status).toBe('done');
    expect(run.agent_version).toBe(1);
    expect(run.effective_prompt).toBe('ORIGINAL system prompt.');
    expect(llm.prompts).toHaveLength(3);
    expect(llm.prompts.every((p) => p.includes('ORIGINAL system prompt.') && !p.includes('CHANGED prompt.'))).toBe(true);
    const results = run.case_results as { case_name: string; case_id: string | null; pass: boolean; expected_output: Expectation }[];
    expect(results.map((r) => r.case_name)).toEqual(['A config key', 'B users', 'C other']);
    expect(results[1]).toMatchObject({ case_id: null, expected_output: { kind: 'must_not_flag' } }); // deleted mid-run, still scored
    expect(results[2]).toMatchObject({ pass: true, expected_output: { kind: 'must_not_flag' } }); // original expectation
    expect(run.cases_passed).toBe(2);

    // A later edit and delete leave the finished run as it was (AC-31).
    await app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { name: 'C renamed' } });
    await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
    // Only the live link to the deleted case (`case_id`) goes null; scores, name and expectation stay.
    const unlink = (r: { case_results: object[] }) => ({ ...r, case_results: r.case_results.map((x) => ({ ...x, case_id: null })) });
    expect(unlink(await waitForSuiteRun(app, run.id))).toEqual(unlink(run));
  });

  it('EC-7/NFR-8/NFR-3: a model failure on case 2 fails the run with the case and reason, null metrics, no retry, and is logged', async () => {
    const { app, llm } = await fresh();
    llm.respond = (n, p) => (n === 2 ? new Error('provider exploded') : scripted(n, p));
    const warn = vi.spyOn(app.log, 'warn');
    const { agent } = await abcAgent(app);
    const run = await runAndWait(app, agent.id);
    expect(run).toMatchObject({
      status: 'failed',
      failing_case: 'B users',
      error: 'provider exploded',
      recall: null,
      precision: null,
      citation_accuracy: null,
      cases_passed: null,
      cost_usd: null,
    });
    expect(llm.n).toBe(2);
    const call = warn.mock.calls.find((c) => c[1] === 'eval: suite run failed');
    expect(call?.[0]).toMatchObject({ agentId: agent.id, version: 1, cases: 3, failingCase: 'B users', reason: 'provider exploded' });
    const evalWarns = warn.mock.calls.filter((c) => String(c[1]).startsWith('eval:'));
    expect(JSON.stringify(evalWarns)).not.toContain('sk_live_xxx');
    // The run list shows it as failed, and the agent can be run again.
    const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(listed[0].status).toBe('failed');
    const dash = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json();
    expect(dash.current).toBeNull();
    llm.respond = scripted;
    expect((await runAndWait(app, agent.id)).status).toBe('done');
  });

  it('AC-37: the trend has one point per done run; a failed run is not a point', async () => {
    const { app, llm } = await fresh();
    const { agent } = await abcAgent(app);
    const first = await runAndWait(app, agent.id);
    llm.respond = () => new Error('provider exploded');
    const failed = await runAndWait(app, agent.id);
    expect(failed.status).toBe('failed');
    llm.respond = scripted;
    const third = await runAndWait(app, agent.id);
    expect(third.status).toBe('done');

    const dash = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard` })).json();
    expect(dash.trend.map((p: { run_id: string }) => p.run_id)).toEqual([first.id, third.id]);
    expect(dash.trend[0]).toEqual(expect.objectContaining({ agent_version: 1, recall: first.recall, precision: first.precision, citation_accuracy: first.citation_accuracy }));
  });

  it('NFR-3: a finished run logs agent, version, case count, passed and duration', async () => {
    const { app } = await fresh();
    const info = vi.spyOn(app.log, 'info');
    const { agent } = await abcAgent(app);
    await runAndWait(app, agent.id);
    await sleep(50); // the log line follows the final write
    const call = info.mock.calls.find((c) => c[1] === 'eval: suite run done');
    expect(call?.[0]).toMatchObject({ agentId: agent.id, version: 1, cases: 3, passed: 2 });
    expect(typeof (call?.[0] as { durationMs: number }).durationMs).toBe('number');
    const evalLogs = info.mock.calls.filter((c) => String(c[1]).startsWith('eval:'));
    expect(JSON.stringify(evalLogs)).not.toContain('stripeKey');
  });

  it('EC-6: a quiet run over must_not_flag cases stores null metrics, passed 2/2', async () => {
    const { app, llm } = await fresh();
    llm.respond = () => review();
    const agent = await createAgent(app);
    await addCase(app, agent.id, 'q1', 'src/api/users.ts', USERS_PATCH, mustNot('src/api/users.ts', 41));
    await addCase(app, agent.id, 'q2', 'src/other.ts', OTHER_PATCH, mustNot('src/other.ts', 2));
    const run = await runAndWait(app, agent.id);
    expect(run).toMatchObject({ status: 'done', recall: null, precision: null, citation_accuracy: null, cases_passed: 2, cases_total: 2 });
  });

  it('EC-12: one unknown case cost makes the run cost null, not a partial sum', async () => {
    const { app, llm } = await fresh();
    llm.cost = (n) => (n === 2 ? null : 0.01);
    const { agent } = await abcAgent(app);
    const run = await runAndWait(app, agent.id);
    expect(run.status).toBe('done');
    expect(run.cost_usd).toBeNull();
    expect(run.case_results.map((r: { cost_usd: number | null }) => r.cost_usd)).toEqual([0.01, null, 0.01]);
  });

  it('EC-17: booting the API marks a leftover running run failed "interrupted" so the agent can run again', async () => {
    const { app } = await fresh();
    const { agent } = await abcAgent(app);
    const [leftover] = await db()
      .insert(t.evalSuiteRuns)
      .values({ workspaceId: ws, agentId: agent.id, agentVersion: 1, status: 'running', casesTotal: 3, effectivePrompt: 'p', model: 'm', provider: 'openai' })
      .returning();
    expect((await start(app, agent.id)).statusCode).toBe(409); // blocked by the leftover

    const { app: rebooted } = await fresh();
    const run = (await rebooted.inject({ method: 'GET', url: `/eval-runs/${leftover!.id}` })).json();
    expect(run).toMatchObject({ status: 'failed', error: 'interrupted' });
    expect(run.finished_at).not.toBeNull();
    expect((await runAndWait(rebooted, agent.id)).status).toBe('done');
  });

  it('AC-23/AC-24/EC-26: the overview lists agents with cases and recent runs; a deleted agent drops out', async () => {
    const { app } = await fresh();
    const { agent: withRun } = await abcAgent(app);
    const { agent: neverRun } = await abcAgent(app);
    const noCases = await createAgent(app);
    const run = await runAndWait(app, withRun.id);

    const overview = async () => (await app.inject({ method: 'GET', url: '/eval/overview' })).json();
    let o = await overview();
    const rowIds = o.agents.map((r: { agent_id: string }) => r.agent_id);
    expect(rowIds).toContain(withRun.id);
    expect(rowIds).toContain(neverRun.id);
    expect(rowIds).not.toContain(noCases.id);
    const row = o.agents.find((r: { agent_id: string }) => r.agent_id === withRun.id);
    expect(row).toMatchObject({ model: 'gpt-4.1', cases_total: 3, latest_run: { id: run.id, status: 'done', agent_version: 1 } });
    expect(row.trend.map((p: { run_id: string }) => p.run_id)).toEqual([run.id]);
    expect(o.agents.find((r: { agent_id: string }) => r.agent_id === neverRun.id).latest_run).toBeNull();
    const recent = o.recent_runs.find((r: { id: string }) => r.id === run.id);
    expect(recent).toMatchObject({ agent_id: withRun.id, agent_name: expect.any(String), cases_passed: 2, cases_total: 3 });

    expect((await app.inject({ method: 'DELETE', url: `/agents/${withRun.id}` })).statusCode).toBe(200);
    o = await overview();
    expect(o.agents.map((r: { agent_id: string }) => r.agent_id)).not.toContain(withRun.id);
    expect(o.recent_runs.map((r: { id: string }) => r.id)).not.toContain(run.id);
    expect((await app.inject({ method: 'GET', url: `/agents/${withRun.id}/eval-dashboard` })).statusCode).toBe(404);
  });
});
