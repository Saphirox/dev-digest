/**
 * Smart Diff pure helpers (`docs/plans/0009-smart-diff-spec-completion.md`
 * step 4): `startLinesByFile` and `sortFiles`.
 *
 * `summarizePatch` and its tests were removed. It built `pseudocode_summary`
 * from regexes over the diff ("exports X", "changes Y", "new file · N added
 * lines") — rule-based, never AI, and so it could only ever name symbols,
 * not explain what the code does. The UI no longer renders a summary, and
 * `buildSmartDiff` now always emits `pseudocode_summary: null`.
 */
import { describe, it, expect } from 'vitest';
import {
  startLinesByFile,
  sortFiles,
  type FindingRangeRow,
} from '../src/modules/reviews/smart-diff/helpers.js';
import type { SmartDiffFile } from '@devdigest/shared';

describe('startLinesByFile', () => {
  it('dedupes the same start line from different agents into one ascending array', () => {
    const rows: FindingRangeRow[] = [
      { file: 'src/app.ts', startLine: 12 },
      { file: 'src/app.ts', startLine: 10 },
      { file: 'src/app.ts', startLine: 10 }, // a second agent, same start line
    ];
    const result = startLinesByFile(rows);
    expect(result.get('src/app.ts')).toEqual([10, 12]);
  });

  it('does no range expansion — only the exact start_line is recorded (Decision 7)', () => {
    const rows: FindingRangeRow[] = [{ file: 'src/big.ts', startLine: 1 }];
    const result = startLinesByFile(rows);
    expect(result.get('src/big.ts')).toEqual([1]);
  });

  it('keeps different files in separate entries', () => {
    const rows: FindingRangeRow[] = [
      { file: 'a.ts', startLine: 1 },
      { file: 'b.ts', startLine: 5 },
    ];
    const result = startLinesByFile(rows);
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
