/**
 * Intent Layer — pure helpers. The sentinel test is the "no diff body reaches
 * the classifier" proof: `hunkHeaders` re-scans `diff.raw` for `@@ … @@`
 * lines ONLY, and `buildMessages`'s joined content never contains a line the
 * diff body added.
 */
import { describe, it, expect } from 'vitest';
import {
  clampConfidence,
  extractDocLinks,
  extractIssueRef,
  hunkHeaders,
  renderIntentBlock,
} from '../src/modules/reviews/intent/helpers.js';
import { buildMessages } from '../src/modules/reviews/intent/prompt.js';
import type { PrIntentRecord } from '@devdigest/shared';

const SENTINEL = 'sk_live_SENTINEL';

const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@ function setup() {',
  '   const a = 1;',
  `+  const key = "${SENTINEL}";`,
  '   const b = 2;',
].join('\n');

describe('hunkHeaders — no diff body reaches the classifier', () => {
  it('returns the header + path for a hunk whose added line carries a secret, but never the line itself', () => {
    const files = hunkHeaders(DIFF);
    expect(files).toEqual([{ path: 'src/config.ts', headers: ['@@ -10,3 +10,4 @@ function setup() {'] }]);
    for (const f of files) {
      for (const h of f.headers) {
        expect(h).not.toContain(SENTINEL);
        expect(h.startsWith('+')).toBe(false);
        expect(h.startsWith('-')).toBe(false);
      }
    }
  });

  it('the composed buildMessages(...) content never contains the sentinel, and the system message states diff bodies are excluded', () => {
    const files = hunkHeaders(DIFF);
    const messages = buildMessages({
      title: 'Add a config key',
      body: null,
      docs: [],
      missingRefs: [],
      files: files.map((f) => ({ path: f.path, additions: 1, deletions: 0, headers: f.headers })),
    });
    const joined = messages.map((m) => m.content).join('\n');
    expect(joined).not.toContain(SENTINEL);
    expect(joined).toContain('@@ -10,3 +10,4 @@');
    expect(messages[0]!.content).toMatch(/diff bodies|hunk headers ONLY|excluded/i);
  });

  it('caps hunks per file and files per diff', () => {
    const manyHunks = [
      'diff --git a/a.ts b/a.ts',
      '+++ b/a.ts',
      ...Array.from({ length: 12 }, (_, i) => `@@ -${i},1 +${i},1 @@`),
    ].join('\n');
    expect(hunkHeaders(manyHunks, { maxHunksPerFile: 8 })[0]!.headers).toHaveLength(8);

    const manyFiles = Array.from({ length: 5 }, (_, i) => `+++ b/f${i}.ts\n@@ -1,1 +1,1 @@`).join('\n');
    expect(hunkHeaders(manyFiles, { maxFiles: 2 })).toHaveLength(2);
  });

  it('degrades gracefully when a file has no hunk headers at all (truncated patch)', () => {
    const noHeaders = 'diff --git a/a.ts b/a.ts\n+++ b/a.ts\n';
    const files = hunkHeaders(noHeaders);
    expect(files).toEqual([{ path: 'a.ts', headers: [] }]);
  });
});

describe('extractIssueRef', () => {
  it('finds a #N reference in the title or body, with or without a closing verb', () => {
    expect(extractIssueRef('Fix login bug', 'Closes #42')).toBe(42);
    expect(extractIssueRef('Fixes #7: crash on load', null)).toBe(7);
    expect(extractIssueRef('No issue here', 'Also nothing')).toBeNull();
  });
});

describe('extractDocLinks', () => {
  it('finds docs/… and specs/… .md paths and classifies http(s):// as external_link', () => {
    const body = [
      'See docs/plans/0002-intent-layer.md for the spec.',
      'Also [the API spec](specs/api.md) and [an issue tracker](https://example.com/issues/1).',
    ].join('\n\n');
    const links = extractDocLinks(body);
    expect(links).toContainEqual({ kind: 'repo_file', ref: 'docs/plans/0002-intent-layer.md' });
    expect(links).toContainEqual({ kind: 'repo_file', ref: 'specs/api.md' });
    expect(links).toContainEqual({ kind: 'external_link', ref: 'https://example.com/issues/1' });
  });

  it('returns [] for a null/empty body and caps the count', () => {
    expect(extractDocLinks(null)).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => `docs/plans/000${i}-x.md`).join(' ');
    expect(extractDocLinks(many, { max: 3 })).toHaveLength(3);
  });

  it('rejects a markdown-link target that escapes docs/specs via ../ traversal, even after normalisation', () => {
    // Path-traversal regression: a markdown link accepted ANY `.md` target and
    // stripped only a leading `./`/`/`, so `[spec](../../../../etc/passwd.md)`
    // reached `readFile` untouched. The allowlist must apply to the markdown-
    // link branch too, and must normalise before checking (not just reject a
    // literal leading `..`).
    expect(extractDocLinks('[spec](../../../../../../etc/passwd.md)')).toEqual([]);
    expect(extractDocLinks('[spec](/etc/passwd.md)')).toEqual([]);
    expect(extractDocLinks('[spec](docs/../../../../etc/passwd.md)')).toEqual([]);
    // The bare-path branch is equally exposed to a normalised escape.
    expect(extractDocLinks('docs/../../../../etc/passwd.md')).toEqual([]);
  });
});

describe('clampConfidence', () => {
  it('caps at 0.5 for an empty body', () => {
    expect(clampConfidence(0.9, { hasBody: false })).toBeLessThanOrEqual(0.5);
  });

  it('caps at 0.6 when any evidence source is unreachable', () => {
    expect(clampConfidence(0.9, { hasBody: true, anyUnreachable: true, hasIssueOrDoc: true })).toBeLessThanOrEqual(0.6);
  });

  it('caps at 0.75 when there is no issue and no doc', () => {
    expect(clampConfidence(0.9, { hasBody: true, anyUnreachable: false, hasIssueOrDoc: false })).toBeLessThanOrEqual(0.75);
  });

  it('never raises the model’s own number, and clamps into [0,1]', () => {
    expect(clampConfidence(0.3, {})).toBe(0.3);
    expect(clampConfidence(1.4, {})).toBeLessThanOrEqual(1);
    expect(clampConfidence(-0.4, {})).toBeGreaterThanOrEqual(0);
  });
});

describe('renderIntentBlock', () => {
  const base: PrIntentRecord = {
    pr_id: 'pr-1',
    intent: 'Adds a cheap PR-intent classifier.',
    in_scope: ['intent classifier'],
    out_of_scope: ['unrelated refactors'],
    confidence: 0.8,
    derived_for_sha: 'abc123',
    derived_at: '2026-09-20T00:00:00.000Z',
    stale: false,
    sources: [],
    missing_context: [],
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
  };

  it('ends with a "Missing context: <ref> — not retrievable" line when non-empty', () => {
    const block = renderIntentBlock({ ...base, missing_context: ['docs/plans/0002-intent-layer.md'] });
    expect(block.endsWith('Missing context: docs/plans/0002-intent-layer.md — not retrievable')).toBe(true);
    expect(block).toContain('intent classifier');
    expect(block).toContain('unrelated refactors');
  });

  it('has no missing-context line when it is empty', () => {
    expect(renderIntentBlock(base)).not.toContain('Missing context:');
  });
});
