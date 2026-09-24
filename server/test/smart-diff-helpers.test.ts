/**
 * Smart Diff pure helpers (`docs/plans/0004-smart-diff.md` step 3):
 * `expandFindingLines` and `sortFiles`.
 *
 * `summarizePatch` and its tests were removed. It built `pseudocode_summary`
 * from regexes over the diff ("exports X", "changes Y", "new file · N added
 * lines") — rule-based, never AI, and so it could only ever name symbols,
 * not explain what the code does. The UI no longer renders a summary, and
 * `buildSmartDiff` now always emits `pseudocode_summary: null`.
 */
import { describe, it, expect } from 'vitest';
import {
  expandFindingLines,
  sortFiles,
  type FindingRangeRow,
} from '../src/modules/reviews/smart-diff/helpers.js';
import { MAX_FINDING_RANGE_LINES } from '../src/modules/reviews/smart-diff/constants.js';
import type { SmartDiffFile } from '@devdigest/shared';

describe('expandFindingLines', () => {
  it('dedupes overlapping ranges from different agents on the same file into one ascending array', () => {
    const rows: FindingRangeRow[] = [
      { file: 'src/app.ts', startLine: 10, endLine: 12 },
      { file: 'src/app.ts', startLine: 11, endLine: 13 }, // a second agent, overlapping
    ];
    const result = expandFindingLines(rows);
    expect(result.get('src/app.ts')).toEqual([10, 11, 12, 13]);
  });

  it(`caps a single range at MAX_FINDING_RANGE_LINES (${MAX_FINDING_RANGE_LINES})`, () => {
    const rows: FindingRangeRow[] = [{ file: 'src/big.ts', startLine: 1, endLine: 500 }];
    const result = expandFindingLines(rows);
    const lines = result.get('src/big.ts')!;
    expect(lines).toHaveLength(MAX_FINDING_RANGE_LINES);
    expect(lines[0]).toBe(1);
    expect(lines[lines.length - 1]).toBe(MAX_FINDING_RANGE_LINES);
  });

  it('keeps different files in separate entries', () => {
    const rows: FindingRangeRow[] = [
      { file: 'a.ts', startLine: 1, endLine: 1 },
      { file: 'b.ts', startLine: 5, endLine: 5 },
    ];
    const result = expandFindingLines(rows);
    expect(result.get('a.ts')).toEqual([1]);
    expect(result.get('b.ts')).toEqual([5]);
  });
});

describe('sortFiles', () => {
  function file(path: string, findingLines: number[], additions: number, deletions: number): SmartDiffFile {
    return { path, pseudocode_summary: null, additions, deletions, finding_lines: findingLines };
  }

  it('orders by findings count desc, then total changed lines desc, then path asc', () => {
    const files = [
      file('z-no-findings-small.ts', [], 1, 0),
      file('b-two-findings.ts', [1, 2], 5, 0),
      file('a-two-findings-bigger.ts', [1, 2], 50, 0),
      file('c-no-findings-big.ts', [], 100, 0),
    ];
    const sorted = sortFiles(files).map((f) => f.path);
    expect(sorted).toEqual([
      'a-two-findings-bigger.ts', // 2 findings, 50 changed — findings count wins over c's size
      'b-two-findings.ts', // 2 findings, 5 changed — still beats no-findings files
      'c-no-findings-big.ts', // 0 findings, 100 changed
      'z-no-findings-small.ts', // 0 findings, 1 changed
    ]);
  });
});
