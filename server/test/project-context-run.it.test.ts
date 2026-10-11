import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockEmbedder } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = { verdict: 'comment', summary: 'ok', score: 90, findings: [] };
const INTENT = { summary: 's', in_scope: [], out_of_scope: [], missing_context: [] };

/** Project Context over HTTP and through the run pipeline, with a fixture clone on disk. */
d('project context (fixture clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let clone: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    base = await mkdtemp(join(tmpdir(), 'pc-run-'));
    clone = join(base, 'clone');
    await mkdir(join(clone, 'specs'), { recursive: true });
    await mkdir(join(clone, 'docs', 'specs'), { recursive: true });
    await mkdir(join(clone, '.devdigest', 'insights'), { recursive: true });
    await writeFile(join(clone, 'specs', 'public-api.md'), 'Rate-limited responses MUST return 429 with a Retry-After header.');
    await writeFile(join(clone, 'specs', 'security-baseline.md'), 'No secrets in source.');
    await writeFile(join(clone, 'docs', 'specs', 'payments.md'), '# Payments');
    await writeFile(join(clone, '.devdigest', 'insights', 'q2.md'), '# Q2');
    await writeFile(join(base, 'secret.md'), 'TOP SECRET');
    await symlink(join(base, 'secret.md'), join(clone, 'docs', 'notes.md'));
    await mkdir(join(clone, '.git'), { recursive: true });
    await writeFile(join(clone, '.git', 'config'), '[remote "origin"] url = https://x-access-token:ghp_SUPERTOKEN@github.com/a/b');
    // In-clone symlink: resolves inside the clone root, so containment alone would pass it.
    await symlink(join(clone, '.git', 'config'), join(clone, 'docs', 'git-config.md'));
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(base, { recursive: true, force: true });
  });

  async function makeApp(cloneDir: string) {
    const openai = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF, cloneDir, head: 'e694ac8' }),
        llm: {
          openai,
          // Keeps PR-intent derivation offline (server INSIGHTS 2026-09-20).
          openrouter: new MockLLMProvider('openrouter', { structuredBySchema: { PrIntent: INTENT } }),
        },
      },
    });
    return { app, openai };
  }

  let seq = 0;
  async function repoAndPr() {
    const name = `ctx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo: repo!, pr: pr! };
  }

  async function agentWith(app: Awaited<ReturnType<typeof makeApp>>['app'], paths: string[]) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `A${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const put = await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { context_paths: paths } });
    expect(put.statusCode).toBe(200);
    return agent as { id: string };
  }

  async function run(app: Awaited<ReturnType<typeof makeApp>>['app'], prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentIds: [agentId] } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    await waitForRunTrace(pg.handle.db, runId);
    return (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
  }

  function reviewUserMessage(openai: MockLLMProvider): string {
    const call = openai.calls.filter((c) => c.method === 'completeStructured').at(-1)!;
    const msgs = (call.req as { messages: { role: string; content: string }[] }).messages;
    return msgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  }

  it('AC-1/AC-2/EC-6: lists docs with type and tokens, reflecting the clone at request time', async () => {
    const { app } = await makeApp(clone);
    const { repo } = await repoAndPr();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { cloned: boolean; files: { path: string; type: string; tokens: number | null }[] };
    expect(body.cloned).toBe(true);
    expect(body.files.map((f) => [f.path, f.type])).toEqual([
      ['.devdigest/insights/q2.md', 'insights'],
      ['docs/specs/payments.md', 'specs'],
      ['specs/public-api.md', 'specs'],
      ['specs/security-baseline.md', 'specs'],
    ]);
    expect(body.files.every((f) => typeof f.tokens === 'number' && f.tokens > 0)).toBe(true);

    await writeFile(join(clone, 'docs', 'added.md'), 'new');
    const again = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json() as typeof body;
    expect(again.files.map((f) => f.path)).toContain('docs/added.md');
    await rm(join(clone, 'docs', 'added.md'));
    await app.close();
  });

  it('EC-8: a repository with no clone reports cloned:false', async () => {
    const { app } = await makeApp(join(base, 'does-not-exist'));
    const { repo } = await repoAndPr();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.json()).toEqual({ cloned: false, files: [] });
    await app.close();
  });

  it('AC-4: GET /context/file returns the content of a listed doc', async () => {
    const { app } = await makeApp(clone);
    const { repo } = await repoAndPr();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/file?path=specs/public-api.md` });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toContain('MUST return 429');
    await app.close();
  });

  it('NFR-1/NFR-2: symlink escapes, traversal and unlisted paths are 404 with no contents or host path', async () => {
    const { app } = await makeApp(clone);
    const { repo } = await repoAndPr();
    for (const p of ['docs/notes.md', 'specs/../../../etc/passwd.md', '../secret.md', 'src/app.ts', 'specs/missing.md']) {
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(p)}`,
      });
      expect(res.statusCode, p).toBe(404);
      expect(res.body).not.toContain('TOP SECRET');
      expect(res.body).not.toContain(base);
    }
    await app.close();
  });

  it('AC-17/AC-21/AC-24: attached docs reach the prompt in order as untrusted blocks and land in the trace', async () => {
    const { app, openai } = await makeApp(clone);
    const { pr } = await repoAndPr();
    const agent = await agentWith(app, ['specs/security-baseline.md', 'specs/public-api.md']);
    const trace = await run(app, pr.id, agent.id);

    const user = reviewUserMessage(openai);
    expect(user).toContain('## Project context');
    const first = user.indexOf('source="specs/security-baseline.md"');
    const second = user.indexOf('source="specs/public-api.md"');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(user).toContain('MUST return 429');

    expect(trace.specs_read).toEqual(['specs/security-baseline.md', 'specs/public-api.md']);
    expect(trace.project_context).toMatchObject([
      { path: 'specs/security-baseline.md', status: 'included' },
      { path: 'specs/public-api.md', status: 'included' },
    ]);
    const tokens = trace.project_context!.map((e) => e.tokens!);
    expect(trace.prompt_assembly.specs_tokens).toBe(tokens[0]! + tokens[1]!);
    expect(trace.project_context_sha).toBe('e694ac8');
    await app.close();
  });

  it('AC-23: project context adds no LLM calls', async () => {
    const plain = await makeApp(clone);
    const withCtx = await makeApp(clone);
    const { pr: pr1 } = await repoAndPr();
    const { pr: pr2 } = await repoAndPr();
    const a1 = await agentWith(plain.app, []);
    const a2 = await agentWith(withCtx.app, ['specs/public-api.md']);
    await run(plain.app, pr1.id, a1.id);
    await run(withCtx.app, pr2.id, a2.id);
    const reviewCalls = (p: MockLLMProvider) => p.calls.filter((c) => c.method === 'completeStructured').length;
    expect(reviewCalls(withCtx.openai)).toBe(reviewCalls(plain.openai));
    await plain.app.close();
    await withCtx.app.close();
  });

  it('EC-1: no attached docs → no Project context section and null trace fields', async () => {
    const { app, openai } = await makeApp(clone);
    const { pr } = await repoAndPr();
    const agent = await agentWith(app, []);
    const trace = await run(app, pr.id, agent.id);
    expect(reviewUserMessage(openai)).not.toContain('## Project context');
    expect(trace.specs_read).toEqual([]);
    expect(trace.project_context ?? null).toBeNull();
    expect(trace.prompt_assembly.specs_tokens ?? null).toBeNull();
    await app.close();
  });

  it('EC-4: a missing attached path is skipped with a warning line and recorded missing; the run completes', async () => {
    const { app, openai } = await makeApp(clone);
    const { pr } = await repoAndPr();
    const agent = await agentWith(app, ['docs/gone.md', 'specs/public-api.md']);
    const trace = await run(app, pr.id, agent.id);
    expect(trace.project_context).toMatchObject([
      { path: 'docs/gone.md', tokens: null, status: 'missing' },
      { path: 'specs/public-api.md', status: 'included' },
    ]);
    // AC-24: specs_read lists only the injected docs; the missing one lives in project_context.
    expect(trace.specs_read).toEqual(['specs/public-api.md']);
    expect(trace.log.some((l) => l.msg.includes('docs/gone.md') && l.msg.startsWith('warning:'))).toBe(true);
    expect(reviewUserMessage(openai)).not.toContain('docs/gone.md');
    await app.close();
  });

  it('EC-9: no clone → run completes without project context, warns, every path missing', async () => {
    const { app, openai } = await makeApp(join(base, 'does-not-exist'));
    const { pr } = await repoAndPr();
    const agent = await agentWith(app, ['specs/public-api.md', 'docs/architecture.md']);
    const trace = await run(app, pr.id, agent.id);
    expect(reviewUserMessage(openai)).not.toContain('## Project context');
    expect(trace.project_context?.map((e) => e.status)).toEqual(['missing', 'missing']);
    expect(trace.specs_read).toEqual([]);
    expect(trace.project_context_sha ?? null).toBeNull();
    expect(trace.log.some((l) => l.msg.includes('not cloned'))).toBe(true);
    await app.close();
  });

  it('NFR-1: an attached symlink that escapes the clone is recorded missing and never injected', async () => {
    // A path stored before the symlink existed (or via a direct DB write) must not be read.
    const { app, openai } = await makeApp(clone);
    const { pr } = await repoAndPr();
    const agent = await agentWith(app, ['docs/notes.md']);
    const trace = await run(app, pr.id, agent.id);
    expect(trace.project_context).toMatchObject([{ path: 'docs/notes.md', status: 'missing' }]);
    expect(reviewUserMessage(openai)).not.toContain('TOP SECRET');
    await app.close();
  });

  it('NFR-1: an attached in-clone symlink to .git/config is recorded missing and its content never reaches the prompt or trace', async () => {
    const { app, openai } = await makeApp(clone);
    const { pr } = await repoAndPr();
    const agent = await agentWith(app, ['docs/git-config.md']);
    const trace = await run(app, pr.id, agent.id);
    expect(trace.project_context).toMatchObject([{ path: 'docs/git-config.md', status: 'missing' }]);
    expect(reviewUserMessage(openai)).not.toContain('SUPERTOKEN');
    expect(JSON.stringify(trace)).not.toContain('SUPERTOKEN');
    await app.close();
  });
});
