/**
 * Settings routes (GET/PUT /settings, POST /settings/test-connection).
 * Characterises current behaviour (green today; plan 0013 Step 7 moves this
 * behind a SettingsService with no route shape change).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { SecretsProvider, SecretKey } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A `SecretsProvider` with no `set` — mirrors the read-only MVP backend. */
const READ_ONLY_SECRETS: SecretsProvider = { get: async () => undefined };

/** A writable fake that records persisted keys, for the "BYO key" path. */
class WritableSecrets implements SecretsProvider {
  public set_calls: { key: SecretKey; value: string }[] = [];
  async get(): Promise<string | undefined> {
    return undefined;
  }
  async set(key: SecretKey, value: string): Promise<void> {
    this.set_calls.push({ key, value });
  }
}

d('Settings routes (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('PUT /settings with multiple keys then GET round-trips them', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { theme: 'light', density: 'compact' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ theme: 'light', density: 'compact' });

    const get = await app.inject({ method: 'GET', url: '/settings' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ theme: 'light', density: 'compact' });

    await app.close();
  });

  it('POST /settings/test-connection with a read-only secrets backend → ok:false', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: READ_ONLY_SECRETS },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai', key: 'sk-test-byo' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      provider: 'openai',
      ok: false,
      message: 'Secrets backend is read-only',
    });

    await app.close();
  });

  it('POST /settings/test-connection with a writable secrets backend persists the key and reports the injected LLM listModels result', async () => {
    const secrets = new WritableSecrets();
    const llm = new MockLLMProvider('openai', {
      models: [
        { id: 'gpt-4.1', provider: 'openai' },
        { id: 'gpt-4.1-mini', provider: 'openai' },
      ],
    });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets, llm: { openai: llm } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai', key: 'sk-test-byo' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      provider: 'openai',
      ok: true,
      message: 'OK — 2 models available',
    });
    expect(secrets.set_calls).toEqual([{ key: 'OPENAI_API_KEY', value: 'sk-test-byo' }]);

    await app.close();
  });
});
