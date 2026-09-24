import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';
import { walkDiff } from '../../lib/diff-lines.js';

/**
 * Minimal unified-diff parser. Extracts per-file hunks and the set of new-side
 * line numbers each hunk covers — exactly what the citation-grounding gate
 * needs (file:line must intersect a real hunk).
 *
 * Handles standard `git diff` output:
 *   diff --git a/path b/path
 *   --- a/path
 *   +++ b/path
 *   @@ -oldStart,oldLines +newStart,newLines @@
 *
 * The line-by-line walk (path/hunk tracking, new-side cursor) lives in the
 * shared `walkDiff` — `risks/helpers.ts` re-scans the same raw diff for risk
 * detection and must never drift from this parser's notion of "line N of
 * file X" (see `docs/plans/0003-intent-card-risk-areas.md` Finding 3).
 */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const files: UnifiedDiff['files'] = [];

  let current: UnifiedDiff['files'][number] | null = null;
  let hunk: DiffHunk | null = null;

  for (const event of walkDiff(raw)) {
    if (event.type === 'file') {
      if (current) files.push(current);
      hunk = null;
      current = { path: event.path, additions: 0, deletions: 0, hunks: [] };
      continue;
    }
    if (event.type === 'hunk') {
      if (!current) current = { path: event.path, additions: 0, deletions: 0, hunks: [] };
      hunk = {
        file: current.path,
        oldStart: event.oldStart,
        oldLines: event.oldLines,
        newStart: event.newStart,
        newLines: event.newLines,
        newLineNumbers: [],
      };
      current.hunks.push(hunk);
      continue;
    }
    // event.type === 'line'
    if (!current || !hunk) continue;
    if (event.kind === 'add') {
      current.additions++;
      hunk.newLineNumbers.push(event.line as number);
    } else if (event.kind === 'del') {
      current.deletions++;
      // deletion: no new-side line consumed
    } else {
      // context line: advances new-side cursor and counts as covered
      hunk.newLineNumbers.push(event.line as number);
    }
  }
  if (current) files.push(current);

  return { raw, files: files.filter((f) => f.path) };
}
