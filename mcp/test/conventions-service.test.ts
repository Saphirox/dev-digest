/**
 * `ConventionsService.getConventions` — resolves the repo through the shared
 * `Resolver`, then applies `selectConventions`/`toConventionItem` (already
 * unit-tested in `conventions-helpers.test.ts`). This file covers the
 * service's own contract: repo resolution, the `more` count, and the
 * empty-list shape (the "no conventions" MESSAGE text is rendered by
 * `tools.ts`/`messages.ts`, not the service — see `tools.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { Resolver } from '../src/modules/_shared/resolver.js';
import type { ConventionRecord, ConventionsStore } from '../src/modules/conventions/ports.js';
import { FakeLookupStore } from './fakes.js';

const REPO = { id: 'repo1', full_name: 'acme/payments-api' };

function makeResolver(): Resolver {
  return new Resolver(new FakeLookupStore({ repos: [REPO] }));
}

function convention(overrides: Partial<ConventionRecord> = {}): ConventionRecord {
  return {
    rule: 'rule',
    category: 'general',
    status: 'pending',
    evidence_path: 'a.ts',
    evidence_line: null,
    ...overrides,
  };
}

class FakeConventionsStore implements ConventionsStore {
  constructor(private readonly conventions: ConventionRecord[], private readonly lastScanAt: string | null = null) {}

  async listConventions() {
    return { conventions: this.conventions, last_scan_at: this.lastScanAt };
  }
}

describe('ConventionsService.getConventions', () => {
  it('resolves the repo to its full_name and passes through last_scan_at', async () => {
    const service = new ConventionsService({
      store: new FakeConventionsStore([], '2026-09-01T00:00:00Z'),
      resolver: makeResolver(),
    });

    const result = await service.getConventions({ repo: 'ACME/Payments-API' });
    expect(result.repo).toBe('acme/payments-api');
    expect(result.last_scan_at).toBe('2026-09-01T00:00:00Z');
  });

  it('lists accepted conventions first, capped at 50, with the remainder counted in "more"', async () => {
    const conventions = [
      convention({ rule: 'p1', status: 'pending' }),
      ...Array.from({ length: 55 }, (_, i) => convention({ rule: `a${i}`, status: 'accepted' })),
    ];
    const service = new ConventionsService({
      store: new FakeConventionsStore(conventions),
      resolver: makeResolver(),
    });

    const result = await service.getConventions({ repo: 'acme/payments-api' });
    expect(result.conventions).toHaveLength(50);
    expect(result.conventions.every((c) => c.status === 'accepted')).toBe(true);
    expect(result.more).toBe(6); // 56 total - 50 returned
  });

  it('returns an empty conventions list, not an error, when the repo has none', async () => {
    const service = new ConventionsService({
      store: new FakeConventionsStore([]),
      resolver: makeResolver(),
    });

    const result = await service.getConventions({ repo: 'acme/payments-api' });
    expect(result.conventions).toEqual([]);
    expect(result.more).toBe(0);
  });
});
