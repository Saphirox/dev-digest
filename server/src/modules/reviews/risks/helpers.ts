/**
 * Pure helpers for Risk Areas (no I/O imports — no DB, fs, GitHub, or
 * container). Every function here operates only on its arguments — same rule
 * as `intent/helpers.ts`.
 */
import { walkDiff } from '../../../lib/diff-lines.js';
import { MAX_SCAN_LINES } from './constants.js';

// ---------------------------------------------------------------------------
// addedLines — re-scans a raw unified diff for every `+` line, yielding its
// new-side line number and text. Delegates the file/cursor tracking to the
// shared `walkDiff` (`src/lib/diff-lines.ts`) — the SAME walk
// `parseUnifiedDiff` (`adapters/git/diff-parser.ts`) uses to build the
// `UnifiedDiff` that `groundRisks` validates refs against. Two independent
// copies of this walk used to exist and only agreed by accident (see
// `docs/plans/0003-intent-card-risk-areas.md` Finding 3) — `walkDiff` is now
// the single owner. Detectors may ONLY build risk refs from these tuples —
// that is what guarantees every emitted `path:line` is a real diff line.
// ---------------------------------------------------------------------------

export interface AddedLine {
  path: string;
  line: number;
  text: string;
}

export function addedLines(raw: string, opts: { maxLines?: number } = {}): AddedLine[] {
  const maxLines = opts.maxLines ?? MAX_SCAN_LINES;
  const out: AddedLine[] = [];

  for (const event of walkDiff(raw)) {
    if (event.type !== 'line' || event.kind !== 'add') continue;
    out.push({ path: event.path, line: event.line as number, text: event.text });
    if (out.length >= maxLines) break; // walkDiff is a generator: this stops the walk early
  }

  return out;
}

// ---------------------------------------------------------------------------
// toRanges — collapse a set of new-side line numbers into contiguous
// `{start, end}` ranges (the `12-18` shape the design shows).
// ---------------------------------------------------------------------------

export interface LineRange {
  start: number;
  end: number;
}

export function toRanges(lines: number[]): LineRange[] {
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
  const ranges: LineRange[] = [];

  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && n === last.end + 1) {
      last.end = n;
    } else {
      ranges.push({ start: n, end: n });
    }
  }

  return ranges;
}
