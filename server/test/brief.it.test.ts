/**
 * PR Brief end to end (Testcontainers pg): `GET|POST /pulls/:id/brief`.
 * `risk_brief` defaults to provider `openrouter`, so every app here overrides BOTH
 * `llm.openai` and `llm.openrouter` with a counting MockLLMProvider — a
 * missing override would reach for a real key.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { StructuredRequest, StructuredResult, SecretsProvider } from '@devdigest/shared';
import { PrBrief } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { BRIEF_SCHEMA_NAME } from '../src/modules/brief/prompt.js';
import type { BlastResult, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env = 'test') => loadConfig({ ...process.env, NODE_ENV: env } as NodeJS.ProcessEnv);

const BRIEF_FIXTURE = {
  summary: 'Adds a rate limiter in front of the public API.',
  risks: [
    {
      kind: 'secrets',
      title: 'Live Stripe key committed',
      explanation: 'A key literal is added to config.',
      severity: 'high',
      file_refs: [{ file: 'src/config.ts', start_line: 12, end_line: null }],
    },
    {
      kind: 'capacity',
      title: 'Redis pool exhaustion',
      explanation: 'Pool size is unchanged.',
      severity: 'medium',
      file_refs: [{ file: 'src/lib/redis-pool.ts', start_line: null, end_line: null }],
    },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'live key' },
    { file: './src/rate-limit.ts', line: 5, reason: 'limit window' },
    { file: 'src/utils/retry.ts', line: 3, reason: 'not part of the PR' },
  ],
  file_summaries: [
    { file: 'src/config.ts', summary: 'Adds rate-limit settings next to the existing config.' },
    { file: 'src/utils/retry.ts', summary: 'not part of the PR' },
  ],
};

/** Counts completeStructured calls and can be told to fail. */
class CountingLLM extends MockLLMProvider {
  fail = false;
  seen: StructuredRequest<unknown>[] = [];
  constructor(id: 'openai' | 'openrouter') {
    super(id, { structuredBySchema: { [BRIEF_SCHEMA_NAME]: BRIEF_FIXTURE } });
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (this.fail) throw new Error('provider exploded');
    this.seen.push(req as StructuredRequest<unknown>);
    await new Promise((r) => setTimeout(r, 25));
    return super.completeStructured(req as StructuredRequest<z.infer<typeof req.schema>>) as Promise<StructuredResult<T>>;
  }
}

/** Issue #N always 404s. */
class NoIssueGitHub extends MockGitHubClient {
  override async getIssue(): Promise<never> {
    throw new Error('Not Found');
  }
}

function fakeRepoIntel(blast: BlastResult): RepoIntel {
  const state: IndexState = {
    repoId: 'r1',
    status: 'partial',
    filesIndexed: 1,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'idx-sha',
    indexerVersion: 2,
    updatedAt: new Date(),
  };
  return {
    getIndexState: async () => state,
    getBlastRadius: async () => blast,
  } as unknown as RepoIntel;
}

const BLAST_OK: BlastResult = {
  changedSymbols: [{ file: 'src/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
  callers: [{ file: 'src/server.ts', symbol: 'boot', viaSymbol: 'rateLimit', line: 88, rank: 1 }],
  impactedEndpoints: [],
  degraded: false,
};
const BLAST_NO_DATA = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' } as BlastResult;

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string, body = 'Add a limiter.') {
  const name = `brief-it-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'sha-head-1',
      additions: 14,
      deletions: 0,
      filesCount: 2,
      status: 'needs_review',
      body,
    })
    .returning();
  await db.insert(t.prFiles).values([
    {
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 4,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_51H8xqSECRET",',
    },
    { prId: pr!.id, path: 'src/rate-limit.ts', additions: 10, deletions: 0, patch: '@@ -1 +1,10 @@\n+limit()' },
  ]);
  return pr!;
}

d('PR Brief — GET/POST /pulls/:id/brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function app(over: { llm?: CountingLLM; github?: MockGitHubClient; blast?: BlastResult; env?: string } = {}) {
    const llm = over.llm ?? new CountingLLM('openai');
    return {
      llm,
      app: await buildApp({
        config: config(over.env),
        db: pg.handle.db,
        overrides: {
          github: over.github ?? new MockGitHubClient(),
          repoIntel: fakeRepoIntel(over.blast ?? BLAST_OK),
          llm: { openai: llm, openrouter: llm },
        },
      }),
    };
  }

  it('AC-2, AC-3, AC-9, AC-10, NFR-1, NFR-6: GET → null, POST stores a validated brief with the head SHA, a second GET makes 0 calls', async () => {
    const { app: a, llm } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const before = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toBeNull();

    const posted = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(posted.statusCode).toBe(200);
    const brief = PrBrief.parse(posted.json());
    expect(llm.seen).toHaveLength(1);
    expect(brief.generated_for_sha).toBe('sha-head-1');
    expect(brief.summary).toBe(BRIEF_FIXTURE.summary);
    // The ungrounded risk (Redis pool) and focus item (retry.ts) are dropped; ./ is stripped.
    expect(brief.risks.map((r) => r.title)).toEqual(['Live Stripe key committed']);
    expect(brief.review_focus.map((f) => `${f.file}:${f.line}`)).toEqual(['src/config.ts:12', 'src/rate-limit.ts:5']);
    expect(brief.missing_inputs).toEqual(['intent']);
    expect(brief.cost_usd).toBe(0.001);
    // File summaries: kept for PR files only, from the same single call.
    expect(brief.file_summaries).toEqual([
      { file: 'src/config.ts', summary: 'Adds rate-limit settings next to the existing config.' },
    ]);

    // NFR-1: the patch text (and its secret) never reached the model.
    const sent = JSON.stringify(llm.seen[0]!.messages);
    expect(sent).toContain('src/config.ts +4 -0');
    expect(sent).not.toContain('sk_live_');
    expect(sent).not.toContain('stripeKey');
    // Line ranges (numbers from the @@ headers) are sent; the hunk text is not.
    expect(sent).toContain('src/config.ts +4 -0 wiring lines 10-13');

    const callsBefore = llm.seen.length;
    const after = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(after.json()).toEqual(brief);
    expect(llm.seen.length).toBe(callsBefore);

    // New commits move the PR's head; the stored brief keeps the SHA it was made for.
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-head-2' }).where(eq(t.pullRequests.id, pr.id));
    const stored = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(stored.json().generated_for_sha).toBe('sha-head-1');

    await a.close();
  });

  it('AC-20, EC-1, EC-10: no intent, an unindexed repo and a 404 issue still produce a brief naming all three', async () => {
    const { app: a, llm } = await app({ github: new NoIssueGitHub(), blast: BLAST_NO_DATA });
    const pr = await setupPr(pg.handle.db, workspaceId, 'Fixes #77');

    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toBe(BRIEF_FIXTURE.summary);
    expect(res.json().missing_inputs).toEqual(['intent', 'blast radius (no_data)', 'issue #77']);
    expect(llm.seen).toHaveLength(1);
    await a.close();
  });

  it('EC-4: with no OpenRouter key the error names OPENROUTER_API_KEY and nothing is stored', async () => {
    const noKeys: SecretsProvider = { get: async () => undefined };
    const a = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: noKeys, github: new MockGitHubClient(), repoIntel: fakeRepoIntel(BLAST_OK) },
    });
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.body).toContain('OPENROUTER_API_KEY');
    expect((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json()).toBeNull();
    await a.close();
  });

  it('EC-5: a failing model call returns an error and keeps the earlier brief', async () => {
    const { app: a, llm } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const first = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(first.statusCode).toBe(200);

    llm.fail = true;
    const failed = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);
    expect(failed.body).toContain('Brief generation failed');

    const stored = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(stored.json()).toEqual(first.json());
    await a.close();
  });

  it('EC-9: two parallel POSTs share one model call', async () => {
    const { app: a, llm } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const [x, y] = await Promise.all([
      a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` }),
      a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` }),
    ]);
    expect(x.statusCode).toBe(200);
    expect(y.statusCode).toBe(200);
    expect(llm.seen).toHaveLength(1);
    expect(x.json()).toEqual(y.json());
    await a.close();
  });

  it('unknown PR id → 404 on GET and POST, no model call', async () => {
    const { app: a, llm } = await app();
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await a.inject({ method: 'GET', url: `/pulls/${missing}/brief` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'POST', url: `/pulls/${missing}/brief` })).statusCode).toBe(404);
    expect(llm.seen).toHaveLength(0);
    await a.close();
  });

  it('AC-3: the one model call goes to the provider and model the risk_brief setting resolves to', async () => {
    const openai = new CountingLLM('openai');
    const openrouter = new CountingLLM('openrouter');
    const a = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient(),
        repoIntel: fakeRepoIntel(BLAST_OK),
        llm: { openai, openrouter },
      },
    });
    const pr = await setupPr(pg.handle.db, workspaceId);
    try {
      // Registry default: openrouter / deepseek/deepseek-v4-flash.
      expect((await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(200);
      expect(openrouter.seen).toHaveLength(1);
      expect(openrouter.seen[0]!.model).toBe('deepseek/deepseek-v4-flash');
      expect(openai.seen).toHaveLength(0);

      // Workspace override: openai / gpt-4.1.
      const put = await a.inject({
        method: 'PUT',
        url: '/settings',
        payload: { feature_models: { risk_brief: { provider: 'openai', model: 'gpt-4.1' } } },
      });
      expect(put.statusCode).toBe(200);
      expect((await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(200);
      expect(openrouter.seen).toHaveLength(1);
      expect(openai.seen).toHaveLength(1);
      expect(openai.seen[0]!.model).toBe('gpt-4.1');
    } finally {
      // The workspace row is shared with the other tests in this file.
      await a.inject({
        method: 'PUT',
        url: '/settings',
        payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' } } },
      });
      await a.close();
    }
  });

  it('AC-9: the pr_brief row holds the brief with the head SHA, and a regeneration replaces it', async () => {
    const { app: a } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const first = (await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json();
    const rows1 = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows1).toHaveLength(1);
    expect(rows1[0]!.json).toEqual(first);
    expect((rows1[0]!.json as { generated_for_sha: string }).generated_for_sha).toBe('sha-head-1');

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-head-2' }).where(eq(t.pullRequests.id, pr.id));
    const second = (await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json();
    const rows2 = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows2).toHaveLength(1);
    expect(rows2[0]!.json).toEqual(second);
    expect(second.generated_for_sha).toBe('sha-head-2');
    await a.close();
  });

  it('a brief stored before file_summaries existed still loads, with an empty list', async () => {
    const { app: a } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    const { file_summaries: _drop, ...old } = row!.json as Record<string, unknown>;
    await pg.handle.db.update(t.prBrief).set({ json: old }).where(eq(t.prBrief.prId, pr.id));

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toBe(BRIEF_FIXTURE.summary);
    expect(res.json().file_summaries).toEqual([]);
    await a.close();
  });

  it('AC-25: the deterministic GET /pulls/:id/risks route is gone', async () => {
    const { app: a } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);
    expect((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/risks` })).statusCode).toBe(404);
    await a.close();
  });

  it('AC-12 (server side): GET /pulls/:id/reviews lists the newest review first', async () => {
    const { app: a } = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.reviews).values([
      { workspaceId, prId: pr.id, kind: 'review', verdict: 'comment', score: 60, createdAt: new Date('2026-01-01T00:00:00Z') },
      { workspaceId, prId: pr.id, kind: 'review', verdict: 'approve', score: 90, createdAt: new Date('2026-02-01T00:00:00Z') },
    ]);
    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((r: { verdict: string }) => r.verdict)).toEqual(['approve', 'comment']);
    await a.close();
  });

  it('NFR-4: POST /pulls/:id/brief is limited to 10 per minute', async () => {
    // The rate-limit plugin is off under NODE_ENV=test, so build with a
    // non-test env to make the per-route `config.rateLimit` take effect.
    const { app: a } = await app({ env: 'development' });
    const pr = await setupPr(pg.handle.db, workspaceId);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push((await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    await a.close();
  });
});
