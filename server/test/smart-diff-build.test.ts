/**
 * `buildSmartDiff` — pure assembly of the `SmartDiff` contract
 * (`docs/plans/0004-smart-diff.md` step 4). No repository, no DB: every input
 * is a plain array.
 */
import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, type SmartDiffInputFile } from '../src/modules/reviews/smart-diff/build.js';
import { SPLIT_LINES } from '../src/modules/reviews/smart-diff/constants.js';
import type { FindingRangeRow } from '../src/modules/reviews/smart-diff/helpers.js';

const CORE_FILE: SmartDiffInputFile = {
  path: 'src/modules/reviews/service.ts',
  additions: 60,
  deletions: 60,
  patch: null,
};
const WIRING_FILE: SmartDiffInputFile = {
  path: 'src/config.ts',
  additions: 2,
  deletions: 0,
  patch: null,
};
const BOILERPLATE_FILE: SmartDiffInputFile = {
  path: 'pnpm-lock.yaml',
  additions: 1,
  deletions: 0,
  patch: null,
};

describe('buildSmartDiff', () => {
  it('emits all three groups, in core → wiring → boilerplate order, even when a group is empty', () => {
    const result = buildSmartDiff([CORE_FILE], []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(result.groups.find((g) => g.role === 'core')!.files).toHaveLength(1);
    expect(result.groups.find((g) => g.role === 'wiring')!.files).toEqual([]);
    expect(result.groups.find((g) => g.role === 'boilerplate')!.files).toEqual([]);
  });

  it('classifies each file into its group and always includes finding_lines (empty when unflagged)', () => {
    const result = buildSmartDiff([CORE_FILE, WIRING_FILE, BOILERPLATE_FILE], []);
    expect(result.groups.find((g) => g.role === 'core')!.files[0]).toMatchObject({
      path: CORE_FILE.path,
      finding_lines: [],
    });
    expect(result.groups.find((g) => g.role === 'wiring')!.files[0]).toMatchObject({ path: WIRING_FILE.path });
    expect(result.groups.find((g) => g.role === 'boilerplate')!.files[0]).toMatchObject({ path: BOILERPLATE_FILE.path });
  });

  it('dedupes finding_lines when two agents flag the same line', () => {
    const findingRows: FindingRangeRow[] = [
      { file: CORE_FILE.path, startLine: 10, endLine: 11 },
      { file: CORE_FILE.path, startLine: 11, endLine: 12 }, // a second agent, overlapping at line 11
    ];
    const result = buildSmartDiff([CORE_FILE], findingRows);
    const file = result.groups.find((g) => g.role === 'core')!.files[0]!;
    expect(file.finding_lines).toEqual([10, 11, 12]);
  });

  it(`split_suggestion.too_big flips at exactly SPLIT_LINES (${SPLIT_LINES}), and proposed_splits is always []`, () => {
    // total_lines is the SUM of additions+deletions across every file.
    const atLimit = buildSmartDiff(
      [{ path: 'a.ts', additions: SPLIT_LINES / 2, deletions: SPLIT_LINES / 2, patch: null }],
      [],
    );
    expect(atLimit.split_suggestion.total_lines).toBe(SPLIT_LINES);
    expect(atLimit.split_suggestion.too_big).toBe(false);
    expect(atLimit.split_suggestion.proposed_splits).toEqual([]);

    const overLimit = buildSmartDiff(
      [{ path: 'a.ts', additions: SPLIT_LINES / 2 + 1, deletions: SPLIT_LINES / 2, patch: null }],
      [],
    );
    expect(overLimit.split_suggestion.total_lines).toBe(SPLIT_LINES + 1);
    expect(overLimit.split_suggestion.too_big).toBe(true);
    expect(overLimit.split_suggestion.proposed_splits).toEqual([]);
  });

  it('always emits pseudocode_summary: null — even for a file whose patch adds exports', () => {
    // The rule-based summariser was removed: regexes over a diff could only
    // name symbols ("exports X"), never say what the code does. The contract
    // keeps the (nullish) field, so the builder must emit null — a real patch
    // that WOULD have produced "exports recordRateLimited" proves it.
    const withExports: SmartDiffInputFile = {
      ...CORE_FILE,
      patch: '@@ -0,0 +1,3 @@\n+export function recordRateLimited(ip: string): void {\n+  void ip;\n+}',
    };
    const result = buildSmartDiff([withExports, WIRING_FILE, BOILERPLATE_FILE], []);
    for (const group of result.groups) {
      for (const file of group.files) expect(file.pseudocode_summary).toBeNull();
    }
  });

  it('the result round-trips SmartDiff.parse from @devdigest/shared', () => {
    const result = buildSmartDiff([CORE_FILE, WIRING_FILE, BOILERPLATE_FILE], [
      { file: CORE_FILE.path, startLine: 1, endLine: 2 },
    ]);
    expect(() => SmartDiff.parse(result)).not.toThrow();
    expect(SmartDiff.parse(result)).toEqual(result);
  });
});
