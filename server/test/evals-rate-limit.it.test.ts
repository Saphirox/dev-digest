import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { createAgent, makeApp } from './evals-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[evals-rate-limit] Docker not available — skipping integration tests.');
}

/**
 * NFR-4: the two routes that spend model calls are limited to 10 per minute,
 * like POST /pulls/:id/review. The limiter is not registered under NODE_ENV=test,
 * so the app is built as `development`. The requests below are refused by the
 * route itself (409 / 404) before any model call; they still count against the limit.
 */
d('eval run rate limits (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('NFR-4: POST /agents/:id/eval-runs allows 10 per minute, the 11th is a 429', async () => {
    const app = await makeApp(pg, { nodeEnv: 'development' });
    const agent = await createAgent(app);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push((await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 409)).toBe(true); // empty eval set: refused, no model call
    expect(codes[10]).toBe(429);
    await app.close();
  });

  it('NFR-4: POST /eval-cases/:id/run allows 10 per minute, the 11th is a 429', async () => {
    const app = await makeApp(pg, { nodeEnv: 'development' });
    const ghost = '00000000-0000-0000-0000-0000000000ff';
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push((await app.inject({ method: 'POST', url: `/eval-cases/${ghost}/run` })).statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true);
    expect(codes[10]).toBe(429);
    await app.close();
  });
});
