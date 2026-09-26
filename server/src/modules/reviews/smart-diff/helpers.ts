/**
 * Pure helpers for Smart Diff (no I/O imports — no DB, fs, GitHub, or
 * container) — same rule as `risks/helpers.ts`.
 */
import type { SmartDiffFile } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// startLinesByFile — per-file flagged new-side START lines, deduped across
// agents. No range expansion (Decision 7): `finding_lines` is the sorted,
// unique `start_line` set of non-dismissed in-scope findings.
// ---------------------------------------------------------------------------

export interface FindingRangeRow {
  file: string;
  startLine: number;
}

/** Group each row's `startLine` by file into a deduped, ascending array. */
export function startLinesByFile(rows: FindingRangeRow[]): Map<string, number[]> {
  const byFile = new Map<string, Set<number>>();
  for (const row of rows) {
    const set = byFile.get(row.file) ?? new Set<number>();
    set.add(row.startLine);
    byFile.set(row.file, set);
  }
  const out = new Map<string, number[]>();
  for (const [file, set] of byFile) out.set(file, [...set].sort((a, b) => a - b));
  return out;
}

// ---------------------------------------------------------------------------
// sortFiles — within a group, most-worth-reviewing first.
// ---------------------------------------------------------------------------

/** Order files within a group: findings count desc, then total changed lines
 *  desc, then path asc (a stable tie-break). */
export function sortFiles(files: SmartDiffFile[]): SmartDiffFile[] {
  return [...files].sort((a, b) => {
    if (b.finding_lines.length !== a.finding_lines.length) {
      return b.finding_lines.length - a.finding_lines.length;
    }
    const changedA = a.additions + a.deletions;
    const changedB = b.additions + b.deletions;
    if (changedB !== changedA) return changedB - changedA;
    return a.path.localeCompare(b.path);
  });
}
