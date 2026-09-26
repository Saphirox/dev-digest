/**
 * `buildSmartDiff` — pure assembly of the `SmartDiff` contract
 * (`docs/plans/0009-smart-diff-spec-completion.md` step 4). No repository,
 * no DB: every input is a plain array.
 */
import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, type SmartDiffInputFile } from '../src/modules/reviews/smart-diff/build.js';
import { ROLE_ORDER } from '../src/modules/reviews/smart-diff/constants.js';
import type { FindingRangeRow } from '../src/modules/reviews/smart-diff/helpers.js';

const CORE_FILE: SmartDiffInputFile = {
  path: 'src/modules/reviews/service.ts',
  additions: 60,
  deletions: 60,
  patch: null,
};
const TESTS_FILE: SmartDiffInputFile = {
  path: 'server/test/reviews.test.ts',
  additions: 10,
  deletions: 0,
  patch: null,
};
const WIRING_FILE: SmartDiffInputFile = {
  path: 'src/config.ts',
  additions: 2,
  deletions: 0,
  patch: null,
};
const DOCS_FILE: SmartDiffInputFile = {
  path: 'docs/specs/smart-diff.md',
  additions: 5,
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
  it('emits all five groups, in core → tests → wiring → docs → boilerplate order, even when a group is empty', () => {
    const result = buildSmartDiff([CORE_FILE], []);
    expect(result.groups.map((g) => g.role)).toEqual(ROLE_ORDER);
    expect(result.groups.find((g) => g.role === 'core')!.files).toHaveLength(1);
    expect(result.groups.find((g) => g.role === 'tests')!.files).toEqual([]);
    expect(result.groups.find((g) => g.role === 'wiring')!.files).toEqual([]);
    expect(result.groups.find((g) => g.role === 'docs')!.files).toEqual([]);
    expect(result.groups.find((g) => g.role === 'boilerplate')!.files).toEqual([]);
  });

  it('classifies each file into its group and always includes finding_lines (empty when unflagged)', () => {
    const result = buildSmartDiff([CORE_FILE, TESTS_FILE, WIRING_FILE, DOCS_FILE, BOILERPLATE_FILE], []);
    expect(result.groups.find((g) => g.role === 'core')!.files[0]).toMatchObject({
      path: CORE_FILE.path,
      finding_lines: [],
    });
    expect(result.groups.find((g) => g.role === 'tests')!.files[0]).toMatchObject({ path: TESTS_FILE.path });
    expect(result.groups.find((g) => g.role === 'wiring')!.files[0]).toMatchObject({ path: WIRING_FILE.path });
    expect(result.groups.find((g) => g.role === 'docs')!.files[0]).toMatchObject({ path: DOCS_FILE.path });
    expect(result.groups.find((g) => g.role === 'boilerplate')!.files[0]).toMatchObject({ path: BOILERPLATE_FILE.path });
  });

  it('finding_lines is the sorted, unique set of start lines — no range expansion (Decision 7)', () => {
    const findingRows: FindingRangeRow[] = [
      { file: CORE_FILE.path, startLine: 11 },
      { file: CORE_FILE.path, startLine: 10 },
      { file: CORE_FILE.path, startLine: 11 }, // a second agent, same start line
    ];
    const result = buildSmartDiff([CORE_FILE], findingRows);
    const file = result.groups.find((g) => g.role === 'core')!.files[0]!;
    expect(file.finding_lines).toEqual([10, 11]);
  });

  it('split_suggestion.too_big is always false, and proposed_splits is always []', () => {
    const result = buildSmartDiff(
      [{ path: 'a.ts', additions: 1000, deletions: 1000, patch: null }],
      [],
    );
    expect(result.split_suggestion.total_lines).toBe(2000);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
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
    const result = buildSmartDiff([CORE_FILE, TESTS_FILE, WIRING_FILE, DOCS_FILE, BOILERPLATE_FILE], [
      { file: CORE_FILE.path, startLine: 1 },
    ]);
    expect(() => SmartDiff.parse(result)).not.toThrow();
    expect(SmartDiff.parse(result)).toEqual(result);
  });
});
