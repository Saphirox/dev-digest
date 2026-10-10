import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Review, StructuredRequest, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { IntentService } from '../src/modules/reviews/intent/service.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

type Db = PgFixture['handle']['db'];
type LlmMap = Partial<Record<'openai' | 'anthropic' | 'openrouter', MockLLMProvider>>;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Every agent reports the same grounded finding on src/config.ts:11. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

const INTENT_FIXTURE = {
  summary: 'Adds a rate limiter to the public API.',
  in_scope: ['rate limiting'],
  out_of_scope: ['authentication'],
  missing_context: [],
};

/** Counts diff loads, to prove the shared pre-work runs once (AC-3). */
class CountingGit extends MockGitClient {
  diffCalls = 0;
  override async diff(): Promise<UnifiedDiff> {
    this.diffCalls++;
    return super.diff();
  }
}

/** A git mock whose diff always throws (EC-5, with the pr_files fallback also failing). */
class ThrowingGit extends MockGitClient {
  override async diff(): Promise<UnifiedDiff> {
    throw new Error('git unavailable');
  }
}

/** Slow provider that records the peak number of in-flight model calls (AC-5). */
class InFlightLLM extends MockLLMProvider {
  inFlight = 0;
  peak = 0;
  constructor(private delayMs: number) {
    super('openai', { structured: REVIEW_FIXTURE });
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.inFlight++;
    this.peak = Math.max(this.peak, this.inFlight);
    try {
      await new Promise((r) => setTimeout(r, this.delayMs));
      return await super.completeStructured(req);
    } finally {
      this.inFlight--;
    }
  }
}

const intentMock = () =>
  new MockLLMProvider('openrouter', { structuredBySchema: { PrIntent: INTENT_FIXTURE } });
const intentCalls = (m: MockLLMProvider) =>
  m.calls.filter((c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'PrIntent')
    .length;

let seq = 0;

d('multi-agent review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: Db;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(
    opts: {
      git?: MockGitClient;
      llm?: LlmMap;
      nodeEnv?: 'test' | 'development';
      secrets?: { get: () => Promise<undefined> };
      auth?: { currentUser: () => Promise<never>; currentWorkspace: () => Promise<{ id: string; name: string }> };
    } = {},
  ): Promise<FastifyInstance> {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: opts.nodeEnv ?? 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: opts.git ?? new MockGitClient({ diff: DIFF }),
        // `openrouter` is always overridden: un-overridden it builds a LIVE paid provider.
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: intentMock(),
          ...opts.llm,
        },
        ...(opts.secrets ? { secrets: opts.secrets } : {}),
        ...(opts.auth ? { auth: opts.auth as never } : {}),
      },
    });
  }

  async function setupPr(ws = workspaceId) {
    const name = `multi-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Add rate limiting.',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function newAgent(app: FastifyInstance, provider: 'openai' | 'anthropic' = 'openai') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Multi ${seq++}`, provider, model: 'gpt-4.1', system_prompt: 'review' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  const post = (app: FastifyInstance, prId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: payload as object });

  const rowCounts = async (prId: string) => ({
    runs: (await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId))).length,
    parents: (await db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, prId))).length,
  });

  it('AC-1: [A,B,C] → 1 parent, 3 children pointing at it, multi_agent_run_id in the response', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const [a, b, c] = [await newAgent(app), await newAgent(app), await newAgent(app)];

    const res = await post(app, pr.id, { agentIds: [a.id, b.id, c.id] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(3);
    expect(typeof body.multi_agent_run_id).toBe('string');

    const parents = await db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
    expect(parents).toHaveLength(1);
    expect(parents[0]!.id).toBe(body.multi_agent_run_id);
    const children = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(children).toHaveLength(3);
    expect(children.every((r) => r.multiAgentRunId === parents[0]!.id)).toBe(true);
    await waitForPrRuns(db, pr.id, { expected: 3 });
    await app.close();
  });

  it('AC-1: two agentIds also create a parent (response lists runs in request order)', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const [a, b] = [await newAgent(app), await newAgent(app)];
    const res = await post(app, pr.id, { agentIds: [b.id, a.id] });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([b.id, a.id]);
    expect(typeof body.multi_agent_run_id).toBe('string');
    await waitForPrRuns(db, pr.id, { expected: 2 });
    await app.close();
  });

  it('AC-6: [A] → FK NULL, no parent row, no multi_agent_run_id field', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const a = await newAgent(app);
    const res = await post(app, pr.id, { agentIds: [a.id] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);
    expect('multi_agent_run_id' in body).toBe(false);
    const rows = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.multiAgentRunId).toBeNull();
    expect((await rowCounts(pr.id)).parents).toBe(0);
    await waitForPrRuns(db, pr.id, { expected: 1 });
    await app.close();
  });

  it('AC-2/AC-7: GET /multi-runs/:id returns the parent, runs in agent list order, reviews and groups', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const [a, b, c] = [await newAgent(app), await newAgent(app), await newAgent(app)];
    // Requested in reverse: the GET still lists runs in agent list order (AC-39 tie-break).
    const started = (await post(app, pr.id, { agentIds: [c.id, b.id, a.id] })).json();
    await waitForPrRuns(db, pr.id, { expected: 3 });

    const res = await app.inject({ method: 'GET', url: `/multi-runs/${started.multi_agent_run_id}` });
    expect(res.statusCode).toBe(200);
    const mr = res.json();
    expect(mr).toMatchObject({ id: started.multi_agent_run_id, pr_id: pr.id, pr_number: 482, pr_title: 'Add rate limiting' });
    expect(typeof mr.ran_at).toBe('string');
    expect(mr.runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([a.id, b.id, c.id]);
    expect(mr.runs.every((r: { status: string }) => r.status === 'done')).toBe(true);
    expect(mr.reviews).toHaveLength(3);
    // AC-8/AC-9 end to end: all three flagged the same line → one group of 3, no conflict.
    expect(mr.groups).toHaveLength(1);
    expect(mr.groups[0]).toMatchObject({ file: 'src/config.ts', start_line: 11, end_line: 11, conflict: false });
    expect(mr.groups[0].members.map((m: { agent_id: string }) => m.agent_id).sort()).toEqual([a.id, b.id, c.id].sort());
    await app.close();
  });

  it('EC-3: {agentId:A} and {all:true} → 400 invalid_run_request, 0 rows written', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const a = await newAgent(app);
    for (const payload of [{ agentId: a.id }, { all: true }]) {
      const res = await post(app, pr.id, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_run_request');
    }
    expect(await rowCounts(pr.id)).toEqual({ runs: 0, parents: 0 });
    await app.close();
  });

  it('EC-3: {agentIds:[A,B], all:true} → 400 invalid_run_request, 0 rows written', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const [a, b] = [await newAgent(app), await newAgent(app)];
    const res = await post(app, pr.id, { agentIds: [a.id, b.id], all: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    expect(await rowCounts(pr.id)).toEqual({ runs: 0, parents: 0 });
    await app.close();
  });

  it('EC-1: {} , {agentIds:[]} and a non-uuid id → 400 invalid_run_request, 0 rows written', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    for (const payload of [{}, { agentIds: [] }, { agentIds: ['not-a-uuid'] }]) {
      const res = await post(app, pr.id, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_run_request');
    }
    expect(await rowCounts(pr.id)).toEqual({ runs: 0, parents: 0 });
    await app.close();
  });

  it('EC-4: duplicate ids → 400 invalid_run_request, 0 rows written', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const a = await newAgent(app);
    const res = await post(app, pr.id, { agentIds: [a.id, a.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    expect(await rowCounts(pr.id)).toEqual({ runs: 0, parents: 0 });
    await app.close();
  });

  it('EC-2: [A, C from workspace V] → 404, no parent row, no run row for A', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const a = await newAgent(app);
    const [other] = await db.insert(t.workspaces).values({ name: `V-${seq++}` }).returning();
    const [foreign] = await db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign', provider: 'openai', model: 'gpt-4.1', systemPrompt: 's' })
      .returning();
    const res = await post(app, pr.id, { agentIds: [a.id, foreign!.id] });
    expect(res.statusCode).toBe(404);
    expect(await rowCounts(pr.id)).toEqual({ runs: 0, parents: 0 });
    await app.close();
  });

  it('AC-3: the diff and the PR intent are prepared once for 3 agents', async () => {
    const git = new CountingGit({ diff: DIFF });
    const openrouter = intentMock();
    const app = await makeApp({ git, llm: { openrouter } });
    const pr = await setupPr();
    const ids = [(await newAgent(app)).id, (await newAgent(app)).id, (await newAgent(app)).id];
    await post(app, pr.id, { agentIds: ids });
    await waitForPrRuns(db, pr.id, { expected: 3 });
    expect(git.diffCalls).toBe(1);
    expect(intentCalls(openrouter)).toBe(1);
    await app.close();
  });

  it('AC-4: an agent whose provider has no key fails; the others still reach done', async () => {
    // No secrets at all: `anthropic` has no override, so resolving it throws a ConfigError.
    const app = await makeApp({ secrets: { get: async () => undefined } });
    const pr = await setupPr();
    const ok1 = await newAgent(app);
    const broken = await newAgent(app, 'anthropic');
    const ok2 = await newAgent(app);
    const started = (await post(app, pr.id, { agentIds: [ok1.id, broken.id, ok2.id] })).json();
    await waitForPrRuns(db, pr.id, { expected: 3 });

    const mr = (await app.inject({ method: 'GET', url: `/multi-runs/${started.multi_agent_run_id}` })).json();
    const byAgent = new Map(mr.runs.map((r: { agent_id: string; status: string; error: string | null }) => [r.agent_id, r]));
    expect((byAgent.get(ok1.id) as { status: string }).status).toBe('done');
    expect((byAgent.get(ok2.id) as { status: string }).status).toBe('done');
    const failed = byAgent.get(broken.id) as { status: string; error: string | null };
    expect(failed.status).toBe('failed');
    expect(failed.error).toBeTruthy();
    await app.close();
  });

  it('AC-5: child runs execute concurrently (peak in-flight model calls >= 2)', async () => {
    const slow = new InFlightLLM(250);
    const app = await makeApp({ llm: { openai: slow } });
    const pr = await setupPr();
    const ids = [(await newAgent(app)).id, (await newAgent(app)).id, (await newAgent(app)).id];
    await post(app, pr.id, { agentIds: ids });
    await waitForPrRuns(db, pr.id, { expected: 3 });
    expect(slow.peak).toBeGreaterThanOrEqual(2);
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(runs.every((r) => r.status === 'done')).toBe(true);
    await app.close();
  });

  it('EC-5: when the git diff AND the pr_files fallback both fail, every child run fails with "Failed to load PR diff"', async () => {
    const app = await makeApp({ git: new ThrowingGit() });
    const pr = await setupPr();
    const [a, b] = [await newAgent(app), await newAgent(app)];

    // Rows are created through the real repository; the executor is wired like
    // ReviewService wires it, but over a repository whose pr_files read rejects.
    const repo = new ReviewRepository(db);
    const created = await repo.createMultiAgentRun({
      workspaceId,
      prId: pr.id,
      agents: [a, b].map((x) => ({ agentId: x.id, provider: 'openai', model: 'gpt-4.1' })),
    });
    class NoFilesRepo extends ReviewRepository {
      override getPrFiles(): Promise<never> {
        return Promise.reject(new Error('pr_files unavailable'));
      }
    }
    const failing = new NoFilesRepo(db);
    const executor = new ReviewRunExecutor(
      app.container,
      failing,
      app.container.agentsRepo,
      { ensureFresh: async () => undefined } as unknown as IntentService,
    );
    const pull = (await repo.getPull(workspaceId, pr.id))!;
    const repoRow = (await repo.getRepo(pull.repoId))!;
    const agentRows = await Promise.all([a, b].map((x) => app.container.agentsRepo.getById(workspaceId, x.id)));
    await executor.executeRuns(
      workspaceId,
      pull,
      repoRow,
      agentRows.map((agent, i) => ({ agent: agent!, runId: created.runs[i]!.runId })),
    );

    const rows = await db
      .select()
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.id, created.runs.map((r) => r.runId)));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe('failed');
      expect(r.error).toMatch(/^Failed to load PR diff/);
    }
    await app.close();
  });

  it('EC-6/NFR-4: a multi-agent run is invisible from another workspace (GET 404, POST of its agent 404)', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const [a, b] = [await newAgent(app), await newAgent(app)];
    const started = (await post(app, pr.id, { agentIds: [a.id, b.id] })).json();
    await waitForPrRuns(db, pr.id, { expected: 2 });

    const [other] = await db.insert(t.workspaces).values({ name: `V-${seq++}` }).returning();
    const otherApp = await makeApp({
      auth: {
        currentUser: async () => (await app.container.auth.currentUser(undefined)) as never,
        currentWorkspace: async () => ({ id: other!.id, name: other!.name }),
      },
    });
    const foreignGet = await otherApp.inject({ method: 'GET', url: `/multi-runs/${started.multi_agent_run_id}` });
    expect(foreignGet.statusCode).toBe(404);
    const foreignPost = await post(otherApp, pr.id, { agentIds: [a.id, b.id] });
    expect(foreignPost.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/multi-runs/${started.multi_agent_run_id}` })).statusCode).toBe(200);
    const missing = await app.inject({ method: 'GET', url: '/multi-runs/00000000-0000-0000-0000-0000000000aa' });
    expect(missing.statusCode).toBe(404);
    await otherApp.close();
    await app.close();
  });

  it('NFR-1: the read endpoints make no model call', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const [a, b] = [await newAgent(app), await newAgent(app)];
    const started = (await post(app, pr.id, { agentIds: [a.id, b.id] })).json();
    await waitForPrRuns(db, pr.id, { expected: 2 });

    const openai = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const openrouter = intentMock();
    const readApp = await makeApp({ llm: { openai, openrouter } });
    const g1 = await readApp.inject({ method: 'GET', url: `/multi-runs/${started.multi_agent_run_id}` });
    const g2 = await readApp.inject({ method: 'GET', url: '/agents/run-estimates' });
    expect(g1.statusCode).toBe(200);
    expect(g2.statusCode).toBe(200);
    expect(openai.calls).toHaveLength(0);
    expect(openrouter.calls).toHaveLength(0);
    await readApp.close();
    await app.close();
  });

  it('NFR-5: POST /pulls/:id/review allows 10 per minute for a multi-agent run, the 11th is a 429', async () => {
    const app = await makeApp({ nodeEnv: 'development' });
    const pr = await setupPr();
    const [a, b] = [await newAgent(app), await newAgent(app)];
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push((await post(app, pr.id, { agentIds: [a.id, b.id] })).statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    await waitForPrRuns(db, pr.id, { expected: 20, timeoutMs: 30_000 });
    await app.close();
  });
});
