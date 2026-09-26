/**
 * `buildSmartDiff` — pure assembly of the `SmartDiff` contract from
 * `pr_files` rows and the latest-per-agent finding ranges. No I/O.
 */
import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { startLinesByFile, sortFiles, type FindingRangeRow } from './helpers.js';
import { ROLE_ORDER } from './constants.js';

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** Build the `SmartDiff` response from a PR's files + its latest-per-agent
 *  finding ranges. Pure — every value is derived from the arguments. */
export function buildSmartDiff(files: SmartDiffInputFile[], findingRows: FindingRangeRow[]): SmartDiff {
  const findingLinesByFile = startLinesByFile(findingRows);

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>(ROLE_ORDER.map((role) => [role, []]));

  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    const smartFile: SmartDiffFile = {
      path: file.path,
      // Always null. The contract keeps the field (hand-vendored, both copies
      // byte-identical), but the rule-based summariser that filled it was
      // removed: regexes over a diff can only name symbols, never say what
      // the code does, and the UI no longer renders a summary at all.
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLinesByFile.get(file.path) ?? [],
    };
    byRole.get(role)!.push(smartFile);
  }

  return {
    groups: ROLE_ORDER.map((role) => ({ role, files: sortFiles(byRole.get(role)!) })),
    split_suggestion: {
      total_lines: totalLines,
      // Always false — the split-suggestion feature was never built past its
      // threshold constant (Decision 7); `proposed_splits` stays empty too.
      too_big: false,
      proposed_splits: [],
    },
  };
}
