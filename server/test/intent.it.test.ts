import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const INTENT_FIXTURE = {
  summary: 'Adds rate limiting to protect the public API from abuse.',
  in_scope: ['rate limiting middleware'],
  out_of_scope: ['authentication flow'],
  confidence: 0.83,
  missing_context: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
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
  return { repo: repo!, pr: pr! };
}

d('Intent Layer — schema + API (Testcontainers pg)', () => {
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

  it('migration 0016 applies on a clean DB — pr_intent has the 7 new columns', async () => {
    const rows = await pg.handle.db.execute(sql`
      select column_name from information_schema.columns
      where table_name = 'pr_intent'
    `);
    const columns = new Set((rows as unknown as { column_name: string }[]).map((r) => r.column_name));
    for (const col of [
      'derived_for_sha',
      'confidence',
      'sources',
      'missing_context',
      'provider',
      'model',
      'derived_at',
    ]) {
      expect(columns.has(col)).toBe(true);
    }
  });

  it('upsertIntent / getIntent round-trip every column', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const repo = new ReviewRepository(pg.handle.db);

    expect(await repo.getIntent(pr.id)).toBeUndefined();

    await repo.upsertIntent(pr.id, {
      intent: 'Adds rate limiting.',
      inScope: ['rate limiter'],
      outOfScope: ['auth'],
      confidence: 0.75,
      derivedForSha: pr.headSha,
      sources: [{ kind: 'pr_title_body', ref: `PR #${pr.number}`, ok: true, note: null }],
      missingContext: ['docs/plans/0002-intent-layer.md'],
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });

    const record = await repo.getIntent(pr.id);
    expect(record).toMatchObject({
      pr_id: pr.id,
      intent: 'Adds rate limiting.',
      in_scope: ['rate limiter'],
      out_of_scope: ['auth'],
      confidence: 0.75,
      derived_for_sha: pr.headSha,
      sources: [{ kind: 'pr_title_body', ref: `PR #${pr.number}`, ok: true, note: null }],
      missing_context: ['docs/plans/0002-intent-layer.md'],
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    expect(record?.derived_at).not.toBeNull();

    // A second upsert (a re-derive) replaces the row rather than duplicating it.
    await repo.upsertIntent(pr.id, {
      intent: 'Updated intent.',
      inScope: [],
      outOfScope: [],
      confidence: null,
      derivedForSha: 'newsha',
      sources: [],
      missingContext: [],
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    expect((await repo.getIntent(pr.id))?.intent).toBe('Updated intent.');
  });

  it('GET → null, POST /intent/derive → a record, and a new head_sha makes the next GET report stale', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openrouter: new MockLLMProvider('openai', { structuredBySchema: { PrIntent: INTENT_FIXTURE } }),
        },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toBeNull();

    const derived = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/derive` });
    expect(derived.statusCode).toBe(200);
    const result = derived.json();
    expect(result.intent.intent).toBe(INTENT_FIXTURE.summary);
    expect(result.intent.in_scope).toEqual(INTENT_FIXTURE.in_scope);
    expect(result.intent.stale).toBe(false);
    expect(result.model).toBeTruthy();
    expect(result.provider).toBe('openrouter');

    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(after.json()).toMatchObject({ intent: INTENT_FIXTURE.summary, stale: false });

    // The PR gets new commits — head_sha moves — so the stored intent is stale.
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'new-head-sha' }).where(eq(t.pullRequests.id, pr.id));
    const stale = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(stale.json()).toMatchObject({ stale: true });

    await app.close();
  });
});
