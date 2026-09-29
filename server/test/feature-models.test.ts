/**
 * `FeatureModels` (plan 0013 Step 8/9) — pure unit tests over a fake
 * `SettingsStore` and a fake `llm` factory, no DB.
 */
import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { FeatureModels, defaultFeatureModel } from '../src/modules/settings/feature-models.js';
import { ConfigError } from '../src/platform/errors.js';

function storeReturning(rows: { key: string; value: unknown }[]) {
  return { list: vi.fn(async () => rows) };
}

describe('FeatureModels', () => {
  it('resolve: falls back to the registry default when the workspace has no override', async () => {
    const fm = new FeatureModels({ store: storeReturning([]), llm: vi.fn() });

    expect(await fm.override('ws-1', 'onboarding')).toBeUndefined();
    expect(await fm.resolve('ws-1', 'onboarding')).toEqual(defaultFeatureModel('onboarding'));
  });

  it('resolve: an invalid stored override (bad provider enum) is ignored, falling back to the default', async () => {
    const rows = [
      { key: 'feature_models', value: { onboarding: { provider: 'bogus-provider', model: 'x' } } },
    ];
    const fm = new FeatureModels({ store: storeReturning(rows), llm: vi.fn() });

    expect(await fm.override('ws-1', 'onboarding')).toBeUndefined();
    expect(await fm.resolve('ws-1', 'onboarding')).toEqual(defaultFeatureModel('onboarding'));
  });

  it('completeStructured: resolves the choice once, calls llm once with the resolved provider, and passes the resolved model', async () => {
    const rows = [
      { key: 'feature_models', value: { onboarding: { provider: 'anthropic', model: 'claude-x' } } },
    ];
    const structuredResult: StructuredResult<{ ok: boolean }> = {
      data: { ok: true },
      model: 'claude-x',
      tokensIn: 1,
      tokensOut: 1,
      costUsd: null,
      raw: '{}',
      attempts: 1,
    };
    const completeStructured = vi.fn(async () => structuredResult);
    const llm = vi.fn(async () => ({ completeStructured }) as unknown as LLMProvider);
    const fm = new FeatureModels({ store: storeReturning(rows), llm });

    const { choice, result } = await fm.completeStructured('ws-1', 'onboarding', {
      schema: {} as never,
      schemaName: 'Ok',
      messages: [{ role: 'user', content: 'p' }],
    });

    expect(choice).toEqual({ provider: 'anthropic', model: 'claude-x' });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm).toHaveBeenCalledWith('anthropic');
    expect(completeStructured).toHaveBeenCalledTimes(1);
    expect(completeStructured).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-x', schemaName: 'Ok' }),
    );
    expect(result).toBe(structuredResult);
  });

  it('completeStructured: a rejecting llm factory propagates its ConfigError unchanged', async () => {
    const err = new ConfigError('ANTHROPIC_API_KEY is not configured');
    const llm = vi.fn(async () => {
      throw err;
    });
    const fm = new FeatureModels({ store: storeReturning([]), llm });

    await expect(
      fm.completeStructured('ws-1', 'onboarding', {
        schema: {} as never,
        schemaName: 'Ok',
        messages: [{ role: 'user', content: 'p' }],
      }),
    ).rejects.toBe(err);
  });
});
