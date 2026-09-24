/**
 * Pure helpers for Smart Diff (no I/O imports — no DB, fs, GitHub, or
 * container) — same rule as `risks/helpers.ts`.
 */
import { MAX_FINDING_RANGE_LINES } from './constants.js';
import type { SmartDiffFile } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// expandFindingLines — per-file flagged new-side line numbers, deduped
// across agents.
// ---------------------------------------------------------------------------

export interface FindingRangeRow {
  file: string;
  startLine: number;
  endLine: number;
}

/** Expand each `startLine..endLine` range (capped) into a per-file `Set` of
 *  new-side line numbers, deduping ranges from different agents that flag the
 *  same line, then return ascending arrays. */
export function expandFindingLines(rows: FindingRangeRow[]): Map<string, number[]> {
  const byFile = new Map<string, Set<number>>();
  for (const row of rows) {
    const end = Math.min(Math.max(row.startLine, row.endLine), row.startLine + MAX_FINDING_RANGE_LINES - 1);
    const set = byFile.get(row.file) ?? new Set<number>();
    for (let n = row.startLine; n <= end; n++) set.add(n);
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
