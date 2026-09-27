/**
 * `BlastService.getBlastRadius` — resolves repo + PR through the shared
 * `Resolver` (like `ReviewsService`, which also needs both), then reads the
 * precomputed blast-radius map. This file covers the service's own contract:
 * repo/PR resolution, the `pr` label, passthrough of the blast record, and
 * the 404-invalidates-cache behaviour shared with `reviews-service.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { Resolver } from '../src/modules/_shared/resolver.js';
import type { BlastRadiusRecord, BlastStore } from '../src/modules/blast/ports.js';
import { ApiFailure } from '../src/platform/errors.js';
import { FakeLookupStore } from './fakes.js';

const REPO = { id: 'repo1', full_name: 'acme/payments-api' };
const PR = { id: 'pr1', number: 7 };

function makeResolver(): Resolver {
  return new Resolver(new FakeLookupStore({ repos: [REPO], pulls: { [REPO.id]: [PR] } }));
}

function blastRecord(overrides: Partial<BlastRadiusRecord> = {}): BlastRadiusRecord {
  return {
    changed_symbols: [{ name: 'processPayment', file: 'src/payments.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'processPayment',
        file: 'src/payments.ts',
        callers: [{ name: 'handleCheckout', file: 'src/checkout.ts', line: 42 }],
        endpoints_affected: ['POST /checkout'],
        crons_affected: [],
      },
    ],
    summary: null,
    ...overrides,
  };
}

class FakeBlastStore implements BlastStore {
  calls: string[] = [];
  constructor(
    private readonly result: BlastRadiusRecord | ((call: number) => BlastRadiusRecord),
  ) {}

  async getBlastRadius(prId: string): Promise<BlastRadiusRecord> {
    this.calls.push(prId);
    if (typeof this.result === 'function') return this.result(this.calls.length - 1);
    return this.result;
  }
}

describe('BlastService.getBlastRadius', () => {
  it('resolves the repo + PR to a label and passes the blast record through unchanged', async () => {
    const record = blastRecord();
    const store = new FakeBlastStore(record);
    const service = new BlastService({ store, resolver: makeResolver() });

    const result = await service.getBlastRadius({ repo: 'ACME/Payments-API', pr: 7 });

    expect(result.pr).toBe('acme/payments-api#7');
    expect(result.blast).toEqual(record);
    expect(store.calls).toEqual([PR.id]);
  });

  it('passes through degraded/reason/indexed_sha fields unchanged', async () => {
    const record = blastRecord({ degraded: true, reason: 'index_partial', indexed_sha: 'abc123' });
    const store = new FakeBlastStore(record);
    const service = new BlastService({ store, resolver: makeResolver() });

    const result = await service.getBlastRadius({ repo: 'acme/payments-api', pr: 7 });

    expect(result.blast.degraded).toBe(true);
    expect(result.blast.reason).toBe('index_partial');
    expect(result.blast.indexed_sha).toBe('abc123');
  });

  it('invalidates the cached PR id and rethrows on a 404 ApiFailure', async () => {
    const resolver = makeResolver();
    let getBlastRadiusCalls = 0;
    const store: BlastStore = {
      async getBlastRadius() {
        getBlastRadiusCalls += 1;
        throw new ApiFailure(404, 'not found');
      },
    };
    const service = new BlastService({ store, resolver });

    // Warm the resolver's PR cache first.
    await resolver.resolvePr('acme/payments-api', REPO.id, 7);

    await expect(service.getBlastRadius({ repo: 'acme/payments-api', pr: 7 })).rejects.toBeInstanceOf(ApiFailure);
    expect(getBlastRadiusCalls).toBe(1);

    // The cache entry was evicted: resolving again re-hits the lookup store.
    const lookupCallsBefore = (resolver as unknown as { store: FakeLookupStore }).store.calls.length;
    await resolver.resolvePr('acme/payments-api', REPO.id, 7);
    const lookupCallsAfter = (resolver as unknown as { store: FakeLookupStore }).store.calls.length;
    expect(lookupCallsAfter).toBeGreaterThan(lookupCallsBefore);
  });
});
