/**
 * Shared raw-diff line walker. `adapters/git/diff-parser.ts` (builds the
 * structured `UnifiedDiff`) and `modules/reviews/risks/helpers.ts`
 * (re-scans for risk detection, because `UnifiedDiff` carries new-side line
 * NUMBERS but no line TEXT) both need to walk a raw unified diff and agree
 * on the new-side line number of every line. They used to each hand-roll
 * this walk, and only ever agreed because the edge cases (a removed line
 * whose text starts with `--`, a `\ No newline at end of file` marker, a
 * `++ ` content line) were copied verbatim between the two copies — a fix to
 * one without the other would silently desync `groundRisks` from the index
 * it validates against. This file is now the single owner; see
 * `docs/plans/0003-intent-card-risk-areas.md` Finding 3.
 *
 * No I/O — a pure function over the raw diff string. Deliberately placed
 * outside `src/modules/` and `src/adapters/`: a pure domain module
 * (`risks/helpers.ts`) can depend on it without picking up an adapter
 * dependency, and the git adapter can depend on it without reaching into
 * `src/modules/` — either direction would otherwise trip `pnpm arch:check`
 * (`modules-no-concrete-adapters` / `adapters-not-inward-to-app`).
 */

export type DiffLineKind = 'add' | 'del' | 'context';

export type DiffEvent =
  | { type: 'file'; path: string }
  | {
      type: 'hunk';
      path: string;
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
    }
  | {
      type: 'line';
      path: string;
      kind: DiffLineKind;
      /** New-side line number. `null` for a removed line (consumes no new-side line). */
      line: number | null;
      /** Line text with its leading +/-/space marker stripped. */
      text: string;
    };

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Walk a raw unified diff in order, yielding a `file` event on each
 * `+++ b/<path>` marker, a `hunk` event on each `@@ … @@` header, and a
 * `line` event per hunk line (added/removed/context) with its new-side line
 * number where it has one. A generator so a capped consumer (e.g.
 * `addedLines`'s `MAX_SCAN_LINES`) can `break` early without the whole diff
 * being walked first.
 */
export function* walkDiff(raw: string): Generator<DiffEvent> {
  let path = '';
  let cursor = 0;
  let inHunk = false;

  for (const line of raw.split('\n')) {
    // A new file section starts: everything up to its `+++`/`@@` lines is
    // header (`new file mode`, `index …`, `similarity …`), never content of the
    // PREVIOUS file's last hunk. Without this reset those lines were read as
    // context lines of the previous file and widened the grounding index past
    // the file's real end (test/diff-lines.test.ts).
    if (line.startsWith('diff --git')) {
      path = '';
      inHunk = false;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      path = p === '/dev/null' ? '' : p;
      inHunk = false;
      yield { type: 'file', path };
      continue;
    }
    if (line.startsWith('--- ')) continue;

    const hh = line.match(HUNK_HEADER_RE);
    if (hh) {
      const oldStart = Number(hh[1]);
      const oldLines = hh[2] ? Number(hh[2]) : 1;
      const newStart = Number(hh[3]);
      const newLines = hh[4] ? Number(hh[4]) : 1;
      cursor = newStart;
      inHunk = true;
      yield { type: 'hunk', path, oldStart, oldLines, newStart, newLines };
      continue;
    }

    if (!inHunk || !path) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      yield { type: 'line', path, kind: 'add', line: cursor, text: line.slice(1) };
      cursor++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      yield { type: 'line', path, kind: 'del', line: null, text: line.slice(1) };
    } else {
      yield { type: 'line', path, kind: 'context', line: cursor, text: line.slice(1) };
      cursor++;
    }
  }
}
