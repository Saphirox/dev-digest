import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { AgentManifest, type LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { CiRepository } from '../src/modules/ci/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-runs] Docker not available — skipping integration tests.');
}

const REPO = 'acme/payments-api'; // seeded by `seed`

/** An LLM provider that records any call (NFR-4). */
function forbiddenLlm(id: LLMProvider['id'], calls: string[]): LLMProvider {
  return new Proxy({ id } as unknown as LLMProvider, {
    get: (target, prop) =>
      prop === 'id'
        ? target.id
        : () => {
            calls.push(String(prop));
            throw new Error('LLM must not be called by CI ingest');
          },
  });
}

const run = (id: number, attempt = 1) => ({
  id,
  attempt,
  head_sha: `sha-${id}`,
  html_url: `https://github.com/${REPO}/actions/runs/${id}`,
  pr_number: 128,
  started_at: '2026-10-02T10:00:00Z',
});
const artifact = (o: object) => ({ kind: 'ok' as const, text: JSON.stringify(o) });
const valid = (over: object = {}) => ({
  findings_count: 3, critical: 0, warning: 2, suggestion: 1,
  cost_usd: 0.0123, duration_ms: 41250, agent: 'Security Reviewer', version: '1', pr_number: 128, ...over,
});

d('CI run ingest over HTTP', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let llmCalls: string[];

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    llmCalls = [];
    await pg.handle.db.delete(t.ciRuns);
    await pg.handle.db.delete(t.ciInstallations);
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));
    await new CiRepository(pg.handle.db).upsertInstallation(
      workspaceId,
      agentId,
      REPO,
      7,
      AgentManifest.parse({
        name: 'Security Reviewer', model: 'openai/gpt-4.1', system_prompt: 'p',
        skills: ['secret-leakage-gate'], ci_fail_on: 'critical',
      }),
    );
  });

  function makeApp(gh: MockGitHubOptions) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(gh),
        llm: {
          openai: forbiddenLlm('openai', llmCalls),
          anthropic: forbiddenLlm('anthropic', llmCalls),
          openrouter: forbiddenLlm('openrouter', llmCalls),
        },
      },
    });
  }

  const refresh = async (gh: MockGitHubOptions) => {
    const app = await makeApp(gh);
    const res = await app.inject({ method: 'POST', url: '/ci/runs/refresh' });
    expect(res.statusCode).toBe(200);
    return { app, body: res.json() as { ingested: number; failed_repos: string[] } };
  };
  const ciAgentRuns = () => pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));

  it('AC-25 / AC-27 / AC-28 / AC-31: stores an agent_runs row (source ci) with a trace and a Passed verdict', async () => {
    const { app, body } = await refresh({ workflowRuns: [run(9912345)], artifacts: { 9912345: artifact(valid()) } });
    expect(body).toEqual({ ingested: 1, failed_repos: [] });

    const rows = await ciAgentRuns();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'ci', agentId, prId: null, model: 'openai/gpt-4.1', costUsd: 0.0123, durationMs: 41250, findingsCount: 3, status: 'done',
    });
    const [trace] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, rows[0]!.id));
    expect(trace!.trace).toMatchObject({
      kind: 'ci', agent_version: 7, model: 'openai/gpt-4.1', runner_version: '1',
      skills: ['secret-leakage-gate'], head_sha: 'sha-9912345', github_run_id: 9912345, run_attempt: 1,
    });

    const list = (await app.inject({ method: 'GET', url: '/ci/runs' })).json();
    expect(list).toMatchObject([
      { repo: REPO, pr_number: 128, agent_name: expect.any(String), verdict: 'passed', findings_count: 3, cost_usd: 0.0123, duration_ms: 41250, job_url: `https://github.com/${REPO}/actions/runs/9912345` },
    ]);

    const inst = (await app.inject({ method: 'GET', url: `/agents/${agentId}/ci/installations` })).json();
    expect(inst[0].latest_run).toMatchObject({ verdict: 'passed' });
  });

  it('AC-30: GET /ci/runs lists ingested runs newest first', async () => {
    const { app } = await refresh({
      workflowRuns: [
        { ...run(1), started_at: '2026-10-01T10:00:00Z' },
        { ...run(2), started_at: '2026-10-03T10:00:00Z' },
        { ...run(3), started_at: '2026-10-02T10:00:00Z' },
      ],
      artifacts: { 1: artifact(valid()), 2: artifact(valid()), 3: artifact(valid()) },
    });
    const list = (await app.inject({ method: 'GET', url: '/ci/runs' })).json() as { job_url: string }[];
    expect(list.map((r) => r.job_url.split('/').pop())).toEqual(['2', '3', '1']);
  });

  it('AC-31: findings meeting ci_fail_on give Changes requested', async () => {
    await refresh({ workflowRuns: [run(1)], artifacts: { 1: artifact(valid({ critical: 1 })) } });
    const [row] = await pg.handle.db.select().from(t.ciRuns);
    expect(row!.status).toBe('changes_requested');
  });

  it('EC-8: a re-run attempt replaces the stored run; one ci_runs and one agent_runs row', async () => {
    await refresh({ workflowRuns: [run(9912345, 1)], artifacts: { 9912345: artifact(valid()) } });
    const { body } = await refresh({
      workflowRuns: [run(9912345, 2)],
      artifacts: { 9912345: artifact(valid({ findings_count: 1, critical: 1, warning: 0, suggestion: 0, cost_usd: 0.5 })) },
    });
    expect(body.ingested).toBe(1);
    const ci = await pg.handle.db.select().from(t.ciRuns);
    expect(ci).toHaveLength(1);
    expect(ci[0]).toMatchObject({ runAttempt: 2, status: 'changes_requested', findingsCount: 1 });
    const runs = await ciAgentRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ findingsCount: 1, costUsd: 0.5 });

    // the same attempt again is a no-op
    const again = await refresh({ workflowRuns: [run(9912345, 2)], artifacts: { 9912345: artifact(valid()) } });
    expect(again.body.ingested).toBe(0);
  });

  it('EC-9: an invalid result stores no agent_runs row and the valid run beside it is still ingested', async () => {
    const { app, body } = await refresh({
      workflowRuns: [run(1), run(2)],
      artifacts: {
        1: artifact({ findings_count: '3', cost_usd: 'free', agent: 'x' }),
        2: artifact(valid()),
      },
    });
    expect(body.ingested).toBe(2);
    expect(await ciAgentRuns()).toHaveLength(1);
    const list = (await app.inject({ method: 'GET', url: '/ci/runs' })).json() as { verdict: string }[];
    expect(list.map((r) => r.verdict).sort()).toEqual(['failed', 'passed']);
  });

  it('EC-17: a run without an artifact is stored as Failed with no findings, cost or duration', async () => {
    const { app } = await refresh({ workflowRuns: [run(5)] });
    const [row] = (await app.inject({ method: 'GET', url: '/ci/runs' })).json();
    expect(row).toMatchObject({ verdict: 'failed', findings_count: null, cost_usd: null, duration_ms: null });
    expect(await ciAgentRuns()).toMatchObject([{ status: 'failed', findingsCount: null, costUsd: null }]);
  });

  it('EC-15: a GitHub 403 reports the repo in failed_repos while stored runs stay listed', async () => {
    await refresh({ workflowRuns: [run(1)], artifacts: { 1: artifact(valid()) } });
    const err = Object.assign(new Error('API rate limit exceeded'), { status: 403 });
    const { app, body } = await refresh({ workflowRuns: err });
    expect(body).toEqual({ ingested: 0, failed_repos: [REPO] });
    expect((await app.inject({ method: 'GET', url: '/ci/runs' })).json()).toHaveLength(1);
  });

  it('NFR-3 / NFR-4: PR timeline and PR-list cost are unchanged by ingest, and no LLM is called', async () => {
    const [repo] = await pg.handle.db.select().from(t.repos);
    const [pr] = await pg.handle.db.select().from(t.pullRequests);
    const app0 = await makeApp({});
    const snapshot = async () => ({
      runs: (await app0.inject({ method: 'GET', url: `/pulls/${pr!.id}/runs` })).json(),
      list: (await app0.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` })).json(),
    });
    const before = await snapshot();
    await refresh({ workflowRuns: [run(1), run(2)], artifacts: { 1: artifact(valid()), 2: artifact(valid()) } });
    expect(await snapshot()).toEqual(before);
    expect(llmCalls).toEqual([]);
  });

  it('upsertInstallation rejects an agent from another workspace and writes no row', async () => {
    const db = pg.handle.db;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'Other' }).returning({ id: t.workspaces.id });
    const [foreign] = await db
      .insert(t.agents)
      .values({ workspaceId: otherWs!.id, name: 'Foreign', provider: 'openrouter', model: 'openai/gpt-4.1', systemPrompt: 'p' })
      .returning({ id: t.agents.id });
    const before = await db.select().from(t.ciInstallations);
    await expect(
      new CiRepository(db).upsertInstallation(
        workspaceId,
        foreign!.id,
        'acme/other-repo',
        1,
        AgentManifest.parse({ name: 'Foreign', model: 'openai/gpt-4.1', system_prompt: 'p' }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await db.select().from(t.ciInstallations)).toHaveLength(before.length);
  });
});
