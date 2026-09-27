/**
 * `modules/blast/helpers.ts` (`blastTotals`) and `render.ts`
 * (`renderTotalsLine`/`renderBlastRadius`) — pure formatting, no I/O.
 */
import { describe, expect, it } from 'vitest';
import { blastTotals } from '../src/modules/blast/helpers.js';
import { renderTotalsLine, renderBlastRadius } from '../src/modules/blast/render.js';
import type { BlastRadiusRecord } from '../src/modules/blast/ports.js';

const NO_CALLERS_TEXT = 'No callers found in the indexed code; nothing else references this symbol.';

function blastRecord(overrides: Partial<BlastRadiusRecord> = {}): BlastRadiusRecord {
  return {
    changed_symbols: [
      { name: 'processPayment', file: 'src/payments.ts', kind: 'function' },
      { name: 'refund', file: 'src/payments.ts', kind: 'function' },
    ],
    downstream: [
      {
        symbol: 'processPayment',
        file: 'src/payments.ts',
        callers: [
          { name: 'handleCheckout', file: 'src/checkout.ts', line: 42 },
          { name: 'retryJob', file: 'src/jobs/retry.ts', line: 10 },
        ],
        endpoints_affected: ['POST /checkout'],
        crons_affected: ['nightly-retry'],
      },
      {
        symbol: 'refund',
        file: 'src/payments.ts',
        callers: [],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: null,
    ...overrides,
  };
}

describe('blastTotals', () => {
  it('counts symbols, callers, and deduped endpoints/crons across downstream entries', () => {
    const totals = blastTotals(blastRecord());
    expect(totals).toEqual({ symbols: 2, callers: 2, endpoints: 1, crons: 1 });
  });

  it('dedupes an endpoint/cron shared by two changed symbols', () => {
    const record = blastRecord({
      downstream: [
        { symbol: 'a', callers: [], endpoints_affected: ['GET /x'], crons_affected: [] },
        { symbol: 'b', callers: [], endpoints_affected: ['GET /x'], crons_affected: [] },
      ],
    });
    expect(blastTotals(record).endpoints).toBe(1);
  });

  it('returns all zeros for an empty blast radius', () => {
    expect(blastTotals(blastRecord({ changed_symbols: [], downstream: [] }))).toEqual({
      symbols: 0,
      callers: 0,
      endpoints: 0,
      crons: 0,
    });
  });
});

describe('renderTotalsLine', () => {
  it('formats "pr: N symbols, N callers, N endpoints, N crons"', () => {
    expect(renderTotalsLine('acme/payments-api#7', blastRecord())).toBe(
      'acme/payments-api#7: 2 symbols, 2 callers, 1 endpoint, 1 cron',
    );
  });

  it('uses singular nouns at count=1, not "1 symbols"/"1 callers"', () => {
    const record = blastRecord({
      changed_symbols: [{ name: 'processPayment', file: 'src/payments.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'processPayment',
          file: 'src/payments.ts',
          callers: [{ name: 'handleCheckout', file: 'src/checkout.ts', line: 42 }],
          endpoints_affected: ['POST /checkout'],
          crons_affected: ['nightly-retry'],
        },
      ],
    });
    expect(renderTotalsLine('acme/payments-api#7', record)).toBe(
      'acme/payments-api#7: 1 symbol, 1 caller, 1 endpoint, 1 cron',
    );
  });

  it('uses plural nouns at count=0', () => {
    const record = blastRecord({ changed_symbols: [], downstream: [] });
    expect(renderTotalsLine('acme/payments-api#7', record)).toBe(
      'acme/payments-api#7: 0 symbols, 0 callers, 0 endpoints, 0 crons',
    );
  });
});

describe('renderBlastRadius', () => {
  it('renders a "name (file)" header, caller file:line lines, and endpoint/cron lines per symbol', () => {
    const text = renderBlastRadius('acme/payments-api#7', blastRecord(), NO_CALLERS_TEXT);
    expect(text).toContain('processPayment (src/payments.ts)');
    expect(text).toContain('src/checkout.ts:42');
    expect(text).toContain('src/jobs/retry.ts:10');
    expect(text).toContain('endpoints: POST /checkout');
    expect(text).toContain('crons: nightly-retry');
  });

  it('uses the caller-supplied "no callers" text for a symbol with zero callers, and omits empty endpoint/cron lines', () => {
    const text = renderBlastRadius('acme/payments-api#7', blastRecord(), NO_CALLERS_TEXT);
    const refundBlock = text.slice(text.indexOf('refund (src/payments.ts)'));
    expect(refundBlock).toContain(NO_CALLERS_TEXT);
    expect(refundBlock).not.toContain('endpoints:');
    expect(refundBlock).not.toContain('crons:');
  });
});
