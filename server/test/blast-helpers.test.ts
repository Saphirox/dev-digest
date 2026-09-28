import { describe, it, expect } from 'vitest';
import { toBlastRadius, pickHistoryFiles, mergePriorPrs, type PerShaResult } from '../src/modules/blast/helpers.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

/**
 * P2 — flat-to-grouped mapping: `toBlastRadius` (repo-intel's flat
 * `BlastResult` → the wire `BlastRadius`), plus the two Prior-PRs helpers.
 */
describe('toBlastRadius', () => {
  const baseResult: BlastResult = {
    changedSymbols: [{ file: 'a.ts', name: 'rateLimit', kind: 'function' }],
    callers: [
      { file: 'b.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 10, rank: 5 },
      { file: 'c.ts', symbol: 'other', viaSymbol: 'rateLimit', line: 20, rank: 9 },
    ],
    impactedEndpoints: ['GET /x'],
    factsByFile: {
      'b.ts': { endpoints: ['GET /x'], crons: [] },
      'c.ts': { endpoints: [], crons: ['nightly-sync'] },
    },
    degraded: false,
  };

  it('groups callers under their changed symbol and orders by rank desc', () => {
    const blast = toBlastRadius(baseResult, 'sha1');
    expect(blast.downstream).toHaveLength(1);
    const impact = blast.downstream[0]!;
    expect(impact.symbol).toBe('rateLimit');
    expect(impact.file).toBe('a.ts');
    expect(impact.callers.map((c) => c.file)).toEqual(['c.ts', 'b.ts']); // rank 9 before 5
    expect(impact.rank).toBe(9);
  });

  it('attributes endpoints_affected/crons_affected as the sorted, deduped union across callers', () => {
    const blast = toBlastRadius(baseResult, 'sha1');
    const impact = blast.downstream[0]!;
    expect(impact.endpoints_affected).toEqual(['GET /x']);
    expect(impact.crons_affected).toEqual(['nightly-sync']);
  });

  it('excludes a caller located in the changed symbol\'s own declaring file', () => {
    const result: BlastResult = {
      ...baseResult,
      callers: [
        { file: 'a.ts', symbol: 'selfCall', viaSymbol: 'rateLimit', line: 3, rank: 99 },
        { file: 'b.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 10, rank: 5 },
      ],
    };
    const blast = toBlastRadius(result, null);
    expect(blast.downstream[0]!.callers).toHaveLength(1);
    expect(blast.downstream[0]!.callers[0]!.file).toBe('b.ts');
  });

  it('caps callers per symbol at the imported MAX_CALLERS_PER_SYMBOL constant', () => {
    const callers = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => ({
      file: `f${i}.ts`,
      symbol: `s${i}`,
      viaSymbol: 'rateLimit',
      line: 1,
      rank: i,
    }));
    const result: BlastResult = { ...baseResult, callers };
    const blast = toBlastRadius(result, null);
    expect(blast.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
  });

  it('respects an explicit maxPerSymbol override', () => {
    const callers = Array.from({ length: 10 }, (_, i) => ({
      file: `f${i}.ts`,
      symbol: `s${i}`,
      viaSymbol: 'rateLimit',
      line: 1,
      rank: i,
    }));
    const result: BlastResult = { ...baseResult, callers };
    const blast = toBlastRadius(result, null, 3);
    expect(blast.downstream[0]!.callers).toHaveLength(3);
  });

  it('emits a DownstreamImpact for a changed symbol with 0 callers', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'a.ts', name: 'lonely', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const blast = toBlastRadius(result, null);
    expect(blast.downstream).toHaveLength(1);
    expect(blast.downstream[0]!.callers).toEqual([]);
    expect(blast.downstream[0]!.rank).toBe(0);
  });

  it('passes degraded/reason through, and sets summary:null + indexed_sha', () => {
    const result: BlastResult = { ...baseResult, degraded: true, reason: 'index_partial' };
    const blast = toBlastRadius(result, 'sha-abc');
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(blast.summary).toBeNull();
    expect(blast.indexed_sha).toBe('sha-abc');
  });

  it('sorts multiple downstream entries by rank desc, then caller count desc, then name', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'a.ts', name: 'bBeta', kind: 'function' },
        { file: 'a.ts', name: 'aAlpha', kind: 'function' },
        { file: 'a.ts', name: 'cGamma', kind: 'function' },
      ],
      callers: [
        { file: 'x.ts', symbol: 's', viaSymbol: 'bBeta', line: 1, rank: 5 },
        { file: 'x.ts', symbol: 's', viaSymbol: 'aAlpha', line: 1, rank: 5 },
        { file: 'y.ts', symbol: 's', viaSymbol: 'aAlpha', line: 2, rank: 5 },
        // cGamma: no callers → rank 0, sorts last.
      ],
      impactedEndpoints: [],
      degraded: false,
    };
    const blast = toBlastRadius(result, null);
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['aAlpha', 'bBeta', 'cGamma']);
  });
});

describe('pickHistoryFiles', () => {
  it('picks the top N files by additions+deletions', () => {
    const files = [
      { path: 'small.ts', additions: 1, deletions: 0 },
      { path: 'big.ts', additions: 50, deletions: 10 },
      { path: 'medium.ts', additions: 5, deletions: 5 },
    ];
    expect(pickHistoryFiles(files)).toEqual(['big.ts', 'medium.ts', 'small.ts']);
  });

  it('caps at PRIOR_PR_MAX_FILES', () => {
    const files = Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.ts`, additions: i, deletions: 0 }));
    expect(pickHistoryFiles(files)).toHaveLength(10);
  });
});

describe('mergePriorPrs', () => {
  it('keeps only merged PRs and drops the current PR', () => {
    const perSha: PerShaResult[] = [
      {
        files: ['a.ts'],
        prs: [
          { number: 401, title: 'Merged one', author: 'a', merged_at: '2026-01-01T00:00:00Z' },
          { number: 402, title: 'Still open', author: 'b', merged_at: null },
          { number: 999, title: 'Current PR', author: 'c', merged_at: '2026-02-01T00:00:00Z' },
        ],
      },
    ];
    const history = mergePriorPrs(perSha, 999);
    expect(history.map((h) => h.pr_number)).toEqual([401]);
    expect(history[0]!.notes).toBe('');
  });

  it('unions files_overlap for a PR found via multiple commits/files', () => {
    const perSha: PerShaResult[] = [
      { files: ['a.ts'], prs: [{ number: 401, title: 't', author: 'a', merged_at: '2026-01-01T00:00:00Z' }] },
      { files: ['b.ts'], prs: [{ number: 401, title: 't', author: 'a', merged_at: '2026-01-01T00:00:00Z' }] },
    ];
    const history = mergePriorPrs(perSha, 1);
    expect(history[0]!.files_overlap).toEqual(['a.ts', 'b.ts']);
  });

  it('sorts by overlap desc then merged_at desc, and caps at 5', () => {
    const perSha: PerShaResult[] = Array.from({ length: 7 }, (_, i) => ({
      files: [`f${i}.ts`],
      prs: [{ number: 100 + i, title: `pr${i}`, author: 'a', merged_at: `2026-01-0${(i % 9) + 1}T00:00:00Z` }],
    }));
    const history = mergePriorPrs(perSha, 1);
    expect(history).toHaveLength(5);
  });
});
