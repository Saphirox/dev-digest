import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * Rate limiting via app.inject(). 127.0.0.1 is allow-listed, so the requests
 * carry a forwarded address to land in a real bucket.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const headers = { 'x-forwarded-for': '203.0.113.7' };

describe('rate limiting', () => {
  it('answers 429 once the global limit is used up', async () => {
    process.env.RATE_LIMIT_MAX = '3';
    const app = await buildApp({ config });
    let last = 0;
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: 'GET', url: '/debug/rate-limits', headers });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    await app.close();
  });

  it('starts a fresh window after the time window passes', async () => {
    process.env.RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_WINDOW = '1 second';
    const app = await buildApp({ config });
    await app.inject({ method: 'GET', url: '/debug/rate-limits', headers });
    const blocked = await app.inject({ method: 'GET', url: '/debug/rate-limits', headers });
    expect(blocked.statusCode).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const again = await app.inject({ method: 'GET', url: '/debug/rate-limits', headers });
    expect(again.statusCode).not.toBe(429);
    await app.close();
  });

  it('returns the error body and lists the client on /debug/rate-limits', async () => {
    process.env.RATE_LIMIT_MAX = '1';
    const app = await buildApp({ config });
    await app.inject({ method: 'GET', url: '/debug/rate-limits', headers });
    const blocked = await app.inject({ method: 'GET', url: '/debug/rate-limits', headers });
    expect(blocked.json().error.code).toBe('internal_error');
    expect(blocked.json().error.message).toContain('Rate limit exceeded');
    const stats = await app.inject({ method: 'GET', url: '/debug/rate-limits' });
    expect(stats.json()['127.0.0.1']).toBeGreaterThanOrEqual(1);
    await app.close();
  });
});
