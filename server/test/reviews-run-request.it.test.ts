/**
 * POST /pulls/:id/review — body validation only (no agent run reaches the
 * pipeline in any of these cases, so no `openrouter` override is needed:
 * the route's `RunRequest.safeParse` throws before any LLM call).
 * Every malformed body answers 400 `invalid_run_request` (spec-0004 EC-1).
 * Asserts status + error code only, never `details`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('POST /pulls/:id/review — run-request body validation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.workspaceId, seeded.workspaceId));
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('no body → 400 invalid_run_request', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    await app.close();
  });

  it('JSON null body → 400 invalid_run_request', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      headers: { 'content-type': 'application/json' },
      payload: 'null',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    await app.close();
  });

  it('empty object body {} → 400 invalid_run_request', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    await app.close();
  });

  it('{ all: "yes" } (removed field) → 400 invalid_run_request', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { all: 'yes' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    await app.close();
  });
});
