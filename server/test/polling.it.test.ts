/**
 * POST /repos/:id/poll — characterises current behaviour and pins the two
 * `opened_at` bugs from `server/INSIGHTS.md` 2026-09-28 ("poll route is a
 * drifted copy of `upsertFromGitHub`; `opened_at` stays NULL forever"):
 * plan 0013 fixes this in Step 5. The two `opened_at` cases below are
 * expected RED until then.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// MockGitHubClient's default `listPullRequests()` fixture: PR #482 with
// `opened_at: '2026-06-01T00:00:00Z'` (`src/adapters/mocks.ts:147-165`).
const DEFAULT_OPENED_AT = new Date('2026-06-01T00:00:00Z');

d('POST /repos/:id/poll (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo(): Promise<string> {
    const name = `poll-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return r!.id;
  }

  it('persists opened_at from GitHub on a fresh import (currently NULL — bug pinned by 2026-09-28 INSIGHTS)', async () => {
    const repoId = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(res.statusCode).toBe(200);

    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
    expect(pr!.openedAt).toEqual(DEFAULT_OPENED_AT);

    await app.close();
  });

  it('backfills an existing NULL opened_at row on poll (currently stays NULL)', async () => {
    const repoId = await newRepo();
    // Pre-insert PR #482 (the mock's default) with a NULL opened_at, as if it
    // was first imported before the opened_at fix shipped.
    await pg.handle.db.insert(t.pullRequests).values({
      workspaceId,
      repoId,
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'stale-sha',
      openedAt: null,
    });

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(res.statusCode).toBe(200);

    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
    expect(pr!.openedAt).toEqual(DEFAULT_OPENED_AT);

    await app.close();
  });

  it('bumps repos.last_polled_at', async () => {
    const repoId = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

    const before = (
      await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repoId))
    )[0]!;
    expect(before.lastPolledAt).toBeNull();

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(res.statusCode).toBe(200);

    const after = (
      await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repoId))
    )[0]!;
    expect(after.lastPolledAt).not.toBeNull();

    await app.close();
  });

  it('unknown repo id → 404', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/repos/00000000-0000-0000-0000-000000000000/poll',
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('missing GitHub token → 500 config_error (deterministic via a read-only, empty secrets override)', async () => {
    const repoId = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      // No `github` override + a secrets provider that never has a token →
      // `container.github()` throws ConfigError on its own (INSIGHTS
      // 2026-09-20 pattern from settings-models.it.test.ts:63).
      overrides: { secrets: { get: async () => undefined } },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('config_error');

    await app.close();
  });

  it('response body is { synced, reviewTriggered: false }', async () => {
    const repoId = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ synced: 1, reviewTriggered: false });

    await app.close();
  });
});
