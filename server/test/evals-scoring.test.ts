import { describe, it, expect } from 'vitest';
import { EvalExpectation as EvalExpectationSchema, type EvalExpectation, type Finding } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/lib/diff-parser.js';
import {
  deltas,
  effectivePrompt,
  expectationFromDecision,
  headeredPatch,
  hunkLineIndex,
  matches,
  periodCutoff,
  pickPatchRow,
  rangeIntersects,
  regression,
  scoreCase,
  scoreSuite,
  sumCostOrNull,
  validateExpectationAgainstDiff,
  type ScoredCase,
} from '../src/modules/evals/helpers.js';

const finding = (file: string, start: number, end = start): Finding => ({
  id: `${file}:${start}`,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
  file,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
});

const mustFind = (file: string, s: number, e = s): EvalExpectation => ({
  kind: 'must_find',
  file,
  start_line: s,
  end_line: e,
});
const mustNot = (file: string, s: number, e = s): EvalExpectation => ({
  kind: 'must_not_flag',
  file,
  start_line: s,
  end_line: e,
});

const kase = (expectation: EvalExpectation, findings: Finding[], dropped = 0, cost: number | null = 0.01): ScoredCase => ({
  expectation,
  findings,
  keptCount: findings.length,
  droppedCount: dropped,
  costUsd: cost,
});

describe('AC-13: matching', () => {
  it('AC-13: a finding at 11-13 overlaps a must_find at 12-12', () => {
    expect(matches(finding('src/config.ts', 11, 13), mustFind('src/config.ts', 12))).toBe(true);
    expect(scoreCase(mustFind('src/config.ts', 12), [finding('src/config.ts', 11, 13)]).pass).toBe(true);
  });

  it('AC-13: a finding at 14-14 does not match 12-12', () => {
    expect(matches(finding('src/config.ts', 14), mustFind('src/config.ts', 12))).toBe(false);
    expect(scoreCase(mustFind('src/config.ts', 12), [finding('src/config.ts', 14)]).pass).toBe(false);
  });

  it('AC-13: ranges are inclusive at both ends', () => {
    expect(matches(finding('a.ts', 5, 12), mustFind('a.ts', 12))).toBe(true);
    expect(matches(finding('a.ts', 1, 4), mustFind('a.ts', 5, 9))).toBe(false);
    expect(matches(finding('a.ts', 10, 20), mustFind('a.ts', 5, 9))).toBe(false);
  });

  it('AC-17: a must_not_flag case passes only when no finding matches', () => {
    expect(scoreCase(mustNot('a.ts', 10, 12), []).pass).toBe(true);
    expect(scoreCase(mustNot('a.ts', 10, 12), [finding('a.ts', 11)]).pass).toBe(false);
    expect(scoreCase(mustNot('a.ts', 10, 12), [finding('b.ts', 11)]).pass).toBe(true);
  });
});

describe('scoreSuite', () => {
  it('AC-14/AC-15: Examples row - recall 1/1, precision 2/3, passed 2/3', () => {
    const score = scoreSuite([
      kase(mustFind('src/config.ts', 12), [finding('src/config.ts', 12), finding('src/config.ts', 3)]),
      kase(mustNot('src/api/users.ts', 40, 44), [finding('src/api/users.ts', 42)]),
      kase(mustNot('src/api/public/webhooks.ts', 61, 74), []),
    ]);
    expect(score.recall).toBe(1);
    expect(score.precision).toBeCloseTo(2 / 3, 10);
    expect(score.casesPassed).toBe(2);
    expect(score.casesTotal).toBe(3);
  });

  it('AC-16: 4 findings, 1 dropped by grounding -> citation accuracy 0.75', () => {
    const score = scoreSuite([
      kase(mustFind('src/config.ts', 12), [finding('src/config.ts', 12), finding('src/config.ts', 13)], 1),
      kase(mustNot('src/a.ts', 1), [finding('src/b.ts', 2)], 0),
    ]);
    expect(score.citationAccuracy).toBe(3 / 4);
  });

  it('EC-9: a finding in another file is not noise for a must_not_flag', () => {
    const score = scoreSuite([kase(mustNot('src/api/users.ts', 40, 44), [finding('src/middleware/ratelimit.ts', 52)])]);
    expect(score.precision).toBe(1);
    expect(score.casesPassed).toBe(1);
  });

  it('EC-6: 8 quiet must_not_flag cases -> every metric null, passed 8/8', () => {
    const score = scoreSuite(Array.from({ length: 8 }, (_, i) => kase(mustNot('a.ts', i + 1), [])));
    expect(score.recall).toBeNull();
    expect(score.precision).toBeNull();
    expect(score.citationAccuracy).toBeNull();
    expect(score.casesPassed).toBe(8);
    expect(score.casesTotal).toBe(8);
  });

  it('EC-6: no must_find case -> recall null while precision is a number', () => {
    const score = scoreSuite([kase(mustNot('a.ts', 1), [finding('b.ts', 4)])]);
    expect(score.recall).toBeNull();
    expect(score.precision).toBe(1);
  });

  it('EC-12: one unknown case cost makes the suite cost null, not a partial sum', () => {
    expect(sumCostOrNull([0.01, 0.02])).toBeCloseTo(0.03, 10);
    expect(sumCostOrNull([0.01, null])).toBeNull();
    expect(sumCostOrNull([])).toBeNull();
    const score = scoreSuite([kase(mustNot('a.ts', 1), [], 0, 0.01), kase(mustNot('a.ts', 2), [], 0, null)]);
    expect(score.costUsd).toBeNull();
  });
});

describe('diff handling', () => {
  const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

  it('AC-3: the headered patch parses to the file with the hunk lines', () => {
    const diff = headeredPatch('src/config.ts', PATCH);
    expect(diff.startsWith('diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@')).toBe(true);
    expect([...(hunkLineIndex(diff).get('src/config.ts') ?? [])]).toEqual([10, 11, 12]);
  });

  it('EC-23: the first intersecting row by id is picked, whatever the input order', () => {
    const stale = { id: 'a-row', patch: '@@ -30,4 +30,6 @@\n x\n+y\n z' };
    const good1 = { id: 'b-row', patch: PATCH };
    const good2 = { id: 'c-row', patch: PATCH };
    const a = pickPatchRow([good2, stale, good1], 'src/config.ts', 11, 11);
    const b = pickPatchRow([good1, good2, stale], 'src/config.ts', 11, 11);
    expect(a).toEqual({ status: 'ok', row: good1 });
    expect(b).toEqual({ status: 'ok', row: good1 });
  });

  it('EC-4: rows without a patch -> no_patch', () => {
    expect(pickPatchRow([{ id: 'a', patch: null }], 'f.ts', 1, 1)).toEqual({ status: 'no_patch' });
    expect(pickPatchRow([], 'f.ts', 1, 1)).toEqual({ status: 'no_patch' });
  });

  it('EC-22: a re-synced patch whose hunk misses the finding -> stale', () => {
    const resynced = { id: 'a', patch: '@@ -30,4 +30,6 @@\n x\n+y\n z' };
    expect(pickPatchRow([resynced], 'src/config.ts', 12, 12)).toEqual({ status: 'stale' });
  });

  it('EC-18: a diff with no parseable hunk is rejected', () => {
    expect(validateExpectationAgainstDiff('just some text', mustNot('a.ts', 1))).toMatch(/no parseable file hunk/);
    expect(validateExpectationAgainstDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts', mustNot('a.ts', 1))).toMatch(
      /no parseable file hunk/,
    );
  });

  it('EC-18: a must_find outside the hunk lines is rejected; inside it passes', () => {
    const diff = headeredPatch('src/config.ts', PATCH);
    expect(validateExpectationAgainstDiff(diff, mustFind('src/config.ts', 11))).toBeNull();
    expect(validateExpectationAgainstDiff(diff, mustFind('src/config.ts', 99))).toMatch(/do not intersect/);
    expect(validateExpectationAgainstDiff(diff, mustFind('other.ts', 11))).toMatch(/not in the diff/);
  });

  it('EC-18: a must_not_flag outside the hunk lines is allowed', () => {
    const diff = headeredPatch('src/config.ts', PATCH);
    expect(validateExpectationAgainstDiff(diff, mustNot('src/config.ts', 99))).toBeNull();
  });
});

describe('security: eval input bounds', () => {
  const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
  const timed = <T,>(fn: () => T): { value: T; ms: number } => {
    const t0 = performance.now();
    const value = fn();
    return { value, ms: performance.now() - t0 };
  };

  it('security: start_line 1e300 is rejected by the EvalExpectation contract', () => {
    const base = { kind: 'must_find', file: 'a.ts' };
    expect(EvalExpectationSchema.safeParse({ ...base, start_line: 1e300, end_line: 1e300 }).success).toBe(false);
    expect(EvalExpectationSchema.safeParse({ ...base, start_line: 1, end_line: 1e300 }).success).toBe(false);
    expect(EvalExpectationSchema.safeParse({ ...base, start_line: 1, end_line: 1_000_001 }).success).toBe(false);
    expect(EvalExpectationSchema.safeParse({ ...base, start_line: 1, end_line: 1_000_000 }).success).toBe(true);
  });

  it('security: rangeIntersects does not loop over the range width (1e300 returns fast)', () => {
    const lines = new Set([10, 11, 12]);
    const hit = timed(() => rangeIntersects(lines, 1, 1e300));
    expect(hit.value).toBe(true);
    expect(hit.ms).toBeLessThan(100);
    const miss = timed(() => rangeIntersects(lines, 13, Number.MAX_SAFE_INTEGER));
    expect(miss.value).toBe(false);
    expect(miss.ms).toBeLessThan(100);
    expect(rangeIntersects(lines, 12, 10)).toBe(true);
  });

  it('security: pickPatchRow with a huge finding range returns fast', () => {
    const row = { id: 'a', patch: PATCH };
    const r = timed(() => pickPatchRow([row], 'src/config.ts', 1, 1e300));
    expect(r.value).toEqual({ status: 'ok', row });
    expect(r.ms).toBeLessThan(100);
  });

  it('security: a hunk header declaring 999999999 new lines with no body does not allocate the range', () => {
    const diff = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,999999999 @@';
    const idx = timed(() => hunkLineIndex(diff));
    expect(idx.value.get('a.ts')?.size ?? 0).toBe(0);
    expect(idx.ms).toBeLessThan(200);
    const v = timed(() => validateExpectationAgainstDiff(diff, mustFind('a.ts', 1, 5)));
    expect(v.value).toMatch(/hunk with no body lines/);
    expect(v.ms).toBeLessThan(200);
  });

  it('security: an empty hunk among non-empty ones is rejected; a deletion-only hunk is a body', () => {
    const head = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n';
    expect(
      validateExpectationAgainstDiff(`${head}@@ -1,2 +1,2 @@\n x\n+y\n@@ -9 +9,5000 @@\n@@ -20,2 +20,2 @@\n z\n+w`, mustNot('a.ts', 1)),
    ).toMatch(/hunk with no body lines/);
    expect(validateExpectationAgainstDiff(`${head}@@ -3,2 +3,0 @@\n-gone\n-gone2`, mustNot('a.ts', 1))).toBeNull();
  });

  it('security: a deletion-only hunk declaring 16000000 new lines is rejected, not indexed', () => {
    const diff = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,16000000 @@\n-x';
    expect(hunkLineIndex(diff).get('a.ts')?.size ?? 0).toBe(0);
    const v = timed(() => validateExpectationAgainstDiff(diff, mustNot('a.ts', 1)));
    expect(v.value).toMatch(/declares 16000000 new-side lines but holds no added or context line/);
    expect(v.ms).toBeLessThan(200);
    expect(validateExpectationAgainstDiff(diff, mustFind('a.ts', 1, 5))).toMatch(/declares 16000000/);
  });

  it('security: a pure-deletion hunk (+N,0), a single-line header and a real hunk are still accepted', () => {
    const head = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n';
    const pure = `${head}@@ -3,2 +3,0 @@\n-gone\n-gone2`;
    expect(parseUnifiedDiff(pure).files[0]!.hunks[0]).toMatchObject({ newLines: 0, newLineNumbers: [] });
    expect(validateExpectationAgainstDiff(pure, mustNot('a.ts', 1))).toBeNull();
    expect(validateExpectationAgainstDiff(`${head}@@ -3,2 +3 @@\n-gone\n-gone2`, mustNot('a.ts', 1))).toBeNull();
    expect(validateExpectationAgainstDiff(`${head}@@ -1,1 +1,2 @@\n-x\n+y\n+z`, mustFind('a.ts', 2))).toBeNull();
  });

  it('security: a bogus hunk after a valid one in the same file is still rejected', () => {
    const head = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n';
    const diff = `${head}@@ -1,2 +1,2 @@\n x\n+y\n@@ -9,1 +9,16000000 @@\n-z`;
    expect(validateExpectationAgainstDiff(diff, mustNot('a.ts', 1))).toMatch(/declares 16000000/);
  });

  it('security: a manual diff with more than 50 files is rejected', () => {
    const file = (i: number) => `diff --git a/f${i}.ts b/f${i}.ts\n--- a/f${i}.ts\n+++ b/f${i}.ts\n@@ -1 +1,2 @@\n x\n+y`;
    const many = (n: number) => Array.from({ length: n }, (_, i) => file(i)).join('\n');
    expect(validateExpectationAgainstDiff(many(51), mustNot('f0.ts', 1))).toMatch(/at most 50 files/);
    expect(validateExpectationAgainstDiff(many(50), mustNot('f0.ts', 1))).toBeNull();
  });
});

describe('expectationFromDecision', () => {
  const base = { file: 'a.ts', startLine: 3, endLine: 4 };
  it('AC-1/AC-2: accepted -> must_find, dismissed -> must_not_flag, ignoring a body kind', () => {
    expect(expectationFromDecision({ ...base, acceptedAt: new Date(), dismissedAt: null }, 'must_not_flag')).toEqual(
      mustFind('a.ts', 3, 4),
    );
    expect(expectationFromDecision({ ...base, acceptedAt: null, dismissedAt: new Date() }, 'must_find')).toEqual(
      mustNot('a.ts', 3, 4),
    );
  });
  it('EC-15: undecided takes the body kind, or null without one', () => {
    expect(expectationFromDecision({ ...base, acceptedAt: null, dismissedAt: null }, 'must_find')).toEqual(mustFind('a.ts', 3, 4));
    expect(expectationFromDecision({ ...base, acceptedAt: null, dismissedAt: null }, undefined)).toBeNull();
  });
});

describe('dashboard maths', () => {
  const m = (recall: number | null, precision: number | null, citation_accuracy: number | null) => ({
    recall,
    precision,
    citation_accuracy,
  });

  it('AC-36: Examples row - precision down 2 points on v7; recall and citation not named', () => {
    const r = regression({ version: 7, ...m(0.82, 0.91, 0.95) }, m(0.78, 0.93, 0.94));
    expect(r).toEqual({ version: 7, metrics: [{ metric: 'precision', drop_pts: 2 }] });
  });

  it('AC-36: a drop of exactly 1 point counts (float-safe), 0.9 points does not', () => {
    expect(regression({ version: 2, ...m(0.81, 1, 1) }, m(0.82, 1, 1))?.metrics).toEqual([{ metric: 'recall', drop_pts: 1 }]);
    expect(regression({ version: 2, ...m(0.811, 1, 1) }, m(0.82, 1, 1))).toBeNull();
  });

  it('AC-36: null on either side is skipped, not a drop to 0', () => {
    expect(regression({ version: 2, ...m(null, 0.5, 0.5) }, m(0.9, 0.5, 0.5))).toBeNull();
    expect(regression({ version: 2, ...m(0.5, 0.5, 0.5) }, m(null, 0.5, 0.5))).toBeNull();
  });

  it('AC-18: signed deltas, null-aware', () => {
    const d = deltas(m(0.82, null, 0.95), m(0.78, 0.9, 0.96));
    expect(d.recall).toBeCloseTo(0.04, 10);
    expect(d.precision).toBeNull();
    expect(d.citation_accuracy).toBeCloseTo(-0.01, 10);
  });

  it('AC-39: period cutoffs', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    expect(periodCutoff('7d', now)?.toISOString()).toBe('2026-09-29T12:00:00.000Z');
    expect(periodCutoff('30d', now)?.toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(periodCutoff('all', now)).toBeNull();
  });

  it('effective prompt joins the system prompt and skill blocks in order', () => {
    expect(effectivePrompt('SYS', ['### a\nA', '### b\nB'])).toBe('SYS\n\n### a\nA\n\n### b\nB');
    expect(effectivePrompt('SYS', [])).toBe('SYS');
  });
});
