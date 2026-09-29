/**
 * `SettingsService` (plan 0013 Step 9) — pure unit tests over fakes, no DB.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GitHubClient, LLMProvider, SecretsProvider } from '@devdigest/shared';
import { SettingsService, type SettingsServiceDeps } from '../src/modules/settings/service.js';
import type { SettingsStore } from '../src/modules/settings/ports.js';
import { ConfigError } from '../src/platform/errors.js';

function makeDeps(overrides: Partial<SettingsServiceDeps> = {}): SettingsServiceDeps {
  const store: SettingsStore = {
    list: vi.fn(async () => []),
    upsertMany: vi.fn(async () => {}),
  };
  return {
    store,
    secrets: { get: vi.fn(async () => undefined) },
    invalidateSecretCaches: vi.fn(),
    github: vi.fn(async () => ({ currentLogin: async () => 'octocat' }) as unknown as GitHubClient),
    llm: vi.fn(async () => ({ listModels: async () => [{ id: 'm1' }] }) as unknown as LLMProvider),
    ...overrides,
  };
}

describe('SettingsService', () => {
  it('update: calls upsertMany once, then list, and returns the flattened settings', async () => {
    const rows = [{ key: 'theme', value: 'dark' }];
    const deps = makeDeps({
      store: {
        upsertMany: vi.fn(async () => {}),
        list: vi.fn(async () => rows),
      },
    });
    const service = new SettingsService(deps);

    const result = await service.update('ws-1', 'user-1', { theme: 'dark' });

    expect(deps.store.upsertMany).toHaveBeenCalledTimes(1);
    expect(deps.store.upsertMany).toHaveBeenCalledWith('ws-1', 'user-1', [['theme', 'dark']]);
    expect(deps.store.list).toHaveBeenCalledTimes(1);
    expect(deps.store.list).toHaveBeenCalledWith('ws-1');
    expect(result).toEqual({ theme: 'dark' });
  });

  it('secretsStatus: returns booleans only, never the underlying key value', async () => {
    const secretValues: Record<string, string> = { OPENROUTER_API_KEY: 'sk-or-super-secret' };
    const deps = makeDeps({
      secrets: { get: vi.fn(async (key: string) => secretValues[key]) },
    });
    const service = new SettingsService(deps);

    const status = await service.secretsStatus();

    expect(status).toEqual({ openai: false, anthropic: false, openrouter: true, github: false });
    expect(JSON.stringify(status)).not.toContain('sk-or-super-secret');
  });

  it('testConnection: a read-only secrets backend rejects a supplied key without persisting it', async () => {
    const deps = makeDeps({ secrets: { get: vi.fn(async () => undefined) } }); // no .set
    const service = new SettingsService(deps);

    const result = await service.testConnection({ provider: 'openai', key: 'sk-new' });

    expect(result).toEqual({
      provider: 'openai',
      ok: false,
      message: 'Secrets backend is read-only',
    });
    expect(deps.llm).not.toHaveBeenCalled();
  });

  it('testConnection: a writable backend persists the key, invalidates caches, and reports the live result', async () => {
    const set = vi.fn(async () => {});
    const llm = vi.fn(async () => ({ listModels: async () => [{ id: 'a' }, { id: 'b' }] }) as unknown as LLMProvider);
    const deps = makeDeps({
      secrets: { get: vi.fn(async () => undefined), set },
      llm,
    });
    const service = new SettingsService(deps);

    const result = await service.testConnection({ provider: 'openai', key: 'sk-new' });

    expect(set).toHaveBeenCalledWith('OPENAI_API_KEY', 'sk-new');
    expect(deps.invalidateSecretCaches).toHaveBeenCalledTimes(1);
    expect(llm).toHaveBeenCalledWith('openai');
    expect(result).toEqual({ provider: 'openai', ok: true, message: 'OK — 2 models available' });
  });

  it('testConnection: a ConfigError from the provider factory is reported as ok:false, not thrown', async () => {
    const deps = makeDeps({
      llm: vi.fn(async () => {
        throw new ConfigError('OPENAI_API_KEY is not configured');
      }),
    });
    const service = new SettingsService(deps);

    const result = await service.testConnection({ provider: 'openai' });

    expect(result).toEqual({
      provider: 'openai',
      ok: false,
      message: 'OPENAI_API_KEY is not configured',
    });
  });
});
