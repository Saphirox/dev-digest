/**
 * `walkDiff` file-boundary regression. Between files, git emits header lines —
 * `diff --git …`, `new file mode …`, `index …` — that are NOT part of the
 * previous file's last hunk. The shared scanner once read them as context
 * lines of the previous file, so the grounding gate (which counts context
 * lines as covered) accepted line numbers past a file's real end: a finding
 * invented at `a.ts:5` passed grounding for a 4-line file.
 */
import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { buildLineIndex } from '@devdigest/reviewer-core';
import { walkDiff } from '../src/lib/diff-lines.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { groundFindings } from '../src/platform/grounding.js';

// a.ts is a NEW 4-line file; real `git diff` output puts b.ts's headers
// directly after a.ts's last hunk.
const RAW = [
  'diff --git a/a.ts b/a.ts',
  'new file mode 100644',
  'index 0000000..e69de29',
  '--- /dev/null',
  '+++ b/a.ts',
  '@@ -0,0 +1,4 @@',
  '+l1',
  '+l2',
  '+l3',
  '+l4',
  'diff --git a/b.ts b/b.ts',
  'index 1111111..2222222 100644',
  '--- a/b.ts',
  '+++ b/b.ts',
  '@@ -1,1 +1,2 @@',
  ' x',
  '+y',
].join('\n');

const sorted = (s: Set<number> | undefined) => [...(s ?? [])].sort((a, b) => a - b);

function finding(partial: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.8,
    ...partial,
  };
}

describe('walkDiff — file boundaries', () => {
  it("never reads the next file's header lines as lines of the previous file", () => {
    const lineTexts = [...walkDiff(RAW)].flatMap((e) => (e.type === 'line' ? [e.text] : []));
    expect(lineTexts).toEqual(['l1', 'l2', 'l3', 'l4', 'x', 'y']);
  });

  it('grounding covers only the lines that really exist in the diff', () => {
    const index = buildLineIndex(parseUnifiedDiff(RAW));
    expect(sorted(index.get('a.ts'))).toEqual([1, 2, 3, 4]);
    expect(sorted(index.get('b.ts'))).toEqual([1, 2]);
  });

  it('drops a finding invented just past the end of a file', () => {
    const diff = parseUnifiedDiff(RAW);
    const res = groundFindings([finding({ start_line: 5, end_line: 5 }), finding({ start_line: 6, end_line: 6 })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toHaveLength(2);
  });

  it('still parses a diff that has no `diff --git` lines', () => {
    const plain = ['+++ b/a.ts', '@@ -0,0 +1,2 @@', '+l1', '+l2', '--- a/b.ts', '+++ b/b.ts', '@@ -1,1 +1,1 @@', '+y'].join('\n');
    const index = buildLineIndex(parseUnifiedDiff(plain));
    expect(sorted(index.get('a.ts'))).toEqual([1, 2]);
    expect(sorted(index.get('b.ts'))).toEqual([1]);
  });
});
