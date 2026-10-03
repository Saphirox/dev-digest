import { describe, it, expect } from 'vitest';
import type { BlastRadius } from '@devdigest/shared';
import {
  blastFiles,
  buildFacts,
  collectSpecPaths,
  factsLength,
  hunkRanges,
  knownFiles,
  missingInputs,
  normalizePath,
  validateBrief,
} from '../src/modules/brief/helpers.js';
import {
  MAX_FACT_CHARS,
  MAX_FILE_SUMMARIES,
  MAX_FILE_SUMMARY_CHARS,
  MAX_FOCUS,
  MAX_RISKS,
} from '../src/modules/brief/constants.js';
import { buildBriefMessages, type BriefModelOutput } from '../src/modules/brief/prompt.js';

const PR_FILES = [{ path: 'src/middleware/ratelimit.ts' }, { path: 'src/config.ts' }, { path: 'package.json' }];

const BLAST: BlastRadius = {
  changed_symbols: [{ name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      file: 'src/middleware/ratelimit.ts',
      callers: [
        { name: 'boot', file: 'src/server.ts', line: 88 },
        { name: 'routes', file: 'src/api/public/index.ts', line: 3 },
      ],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: null,
};

const known = knownFiles(PR_FILES, BLAST);

const risk = (title: string, refs: { file: string; start_line?: number | null; end_line?: number | null }[]) => ({
  kind: 'k',
  title,
  explanation: 'e',
  severity: 'high' as const,
  file_refs: refs.map((r) => ({ file: r.file, start_line: r.start_line ?? null, end_line: r.end_line ?? null })),
});

const output = (over: Partial<BriefModelOutput>): BriefModelOutput => ({
  summary: 's',
  risks: [],
  review_focus: [],
  file_summaries: [],
  ...over,
});

describe('brief helpers — path matching', () => {
  it('EC-8: strips exactly one leading ./ and nothing else', () => {
    expect(normalizePath('./src/a.ts')).toBe('src/a.ts');
    expect(normalizePath('././src/a.ts')).toBe('./src/a.ts');
    expect(normalizePath('Src/a.ts')).toBe('Src/a.ts');
  });

  it('AC-5: knownFiles is PR files plus every blast-map file', () => {
    expect(blastFiles(BLAST).sort()).toEqual(['src/api/public/index.ts', 'src/middleware/ratelimit.ts', 'src/server.ts']);
    expect(blastFiles(null)).toEqual([]);
    for (const f of ['src/config.ts', 'src/server.ts', 'src/api/public/index.ts', 'package.json']) {
      expect(known.has(f)).toBe(true);
    }
    expect(known.has('src/lib/redis-pool.ts')).toBe(false);
  });
});

describe('brief helpers — validateBrief', () => {
  it('AC-5: drops a risk that names no PR or blast-map file', () => {
    const out = validateBrief(
      output({
        risks: [
          risk('Live Stripe key committed', [{ file: 'src/config.ts', start_line: 12 }]),
          risk('Limiter wraps server bootstrap', [{ file: 'src/server.ts', start_line: 88 }]),
          risk('Redis pool exhaustion', [{ file: 'src/lib/redis-pool.ts' }]),
        ],
      }),
      known,
    );
    expect(out.risks.map((r) => r.title)).toEqual(['Live Stripe key committed', 'Limiter wraps server bootstrap']);
  });

  it('AC-5: drops a risk with no refs at all', () => {
    expect(validateBrief(output({ risks: [risk('Ungrounded', [])] }), known).risks).toEqual([]);
  });

  it('AC-26: drops only the bad refs and keeps the risk', () => {
    const out = validateBrief(
      output({
        risks: [
          risk('Secrets in config', [
            { file: 'src/config.ts', start_line: 12 },
            { file: 'src/secrets/vault.ts', start_line: 4 },
          ]),
        ],
      }),
      known,
    );
    expect(out.risks).toHaveLength(1);
    expect(out.risks[0]?.file_refs).toEqual([{ file: 'src/config.ts', start_line: 12 }]);
  });

  it('AC-6, EC-8: keeps grounded focus items, normalizes ./, drops unknown files', () => {
    const out = validateBrief(
      output({
        review_focus: [
          { file: 'src/config.ts', line: 12, reason: 'live Stripe key committed' },
          { file: './src/middleware/ratelimit.ts', line: 52, reason: '429 branch omits Retry-After' },
          { file: 'src/utils/retry.ts', line: 3, reason: 'retries on 429' },
        ],
      }),
      known,
    );
    expect(out.review_focus.map((f) => `${f.file}:${f.line}`)).toEqual([
      'src/config.ts:12',
      'src/middleware/ratelimit.ts:52',
    ]);
  });

  it('EC-8: matching is case-sensitive and exact', () => {
    const out = validateBrief(
      output({ review_focus: [{ file: 'SRC/config.ts', line: 1, reason: 'r' }] }),
      known,
    );
    expect(out.review_focus).toEqual([]);
  });

  it('drops a focus item with a non-positive line and normalizes ref lines', () => {
    const out = validateBrief(
      output({
        risks: [
          risk('r', [
            { file: 'src/config.ts', start_line: 0, end_line: 9 },
            { file: 'src/server.ts', start_line: 10, end_line: 4 },
            { file: 'package.json', start_line: 2, end_line: 6 },
          ]),
        ],
        review_focus: [{ file: 'src/config.ts', line: 0, reason: 'r' }],
      }),
      known,
    );
    expect(out.review_focus).toEqual([]);
    expect(out.risks[0]?.file_refs).toEqual([
      { file: 'src/config.ts' },
      { file: 'src/server.ts', start_line: 10 },
      { file: 'package.json', start_line: 2, end_line: 6 },
    ]);
  });

  it('NFR-6: keeps at most 8 risks and 10 focus items, in the model order', () => {
    const risks = Array.from({ length: 12 }, (_, i) => risk(`risk ${i}`, [{ file: 'src/config.ts' }]));
    const review_focus = Array.from({ length: 15 }, (_, i) => ({ file: 'src/config.ts', line: i + 1, reason: 'r' }));
    const out = validateBrief(output({ risks, review_focus }), known);
    expect(out.risks).toHaveLength(MAX_RISKS);
    expect(out.risks.map((r) => r.title)).toEqual(risks.slice(0, 8).map((r) => r.title));
    expect(out.review_focus).toHaveLength(MAX_FOCUS);
    expect(out.review_focus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('brief helpers — missingInputs', () => {
  const intent = { intent: 'i', inScope: [], outOfScope: [] };

  it('AC-20, EC-1: names intent, the degraded blast reason and the issue', () => {
    const blast: BlastRadius = { changed_symbols: [], downstream: [], summary: null, degraded: true, reason: 'no_data' };
    expect(missingInputs({ intent: null, blast, issueRef: 77, issueFetched: false })).toEqual([
      'intent',
      'blast radius (no_data)',
      'issue #77',
    ]);
  });

  it('EC-1: a degraded blast that still has changed symbols is not missing', () => {
    const blast: BlastRadius = { ...BLAST, degraded: true, reason: 'index_partial' };
    expect(missingInputs({ intent, blast, issueRef: null, issueFetched: false })).toEqual([]);
  });

  it('an unreadable blast radius is missing; a fetched issue is not', () => {
    expect(missingInputs({ intent, blast: null, issueRef: 5, issueFetched: true })).toEqual([
      'blast radius (unavailable)',
    ]);
  });
});

describe('brief helpers — buildFacts', () => {
  const base = {
    title: 'Add rate limiting',
    body: 'Fixes #77',
    intent: null,
    blast: null,
    issue: null,
    missing: [],
  };

  it('AC-4: lists path, stats and Smart Diff role per file', () => {
    const facts = buildFacts({
      ...base,
      files: [
        { path: 'src/config.ts', additions: 4, deletions: 0 },
        { path: 'docs/guide.md', additions: 1, deletions: 2 },
      ],
      specs: [],
    });
    expect(facts.filesText.split('\n')).toEqual(['src/config.ts +4 -0 wiring', 'docs/guide.md +1 -2 docs']);
    expect(facts).toMatchObject({ fileTotal: 2, fileListed: 2, additions: 5, deletions: 2 });
  });

  it('NFR-5: stays within the budget, cutting spec documents first', () => {
    const files = Array.from({ length: 50 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 1, deletions: 1 }));
    const specs = [{ path: 'docs/spec.md', content: 'x'.repeat(90_000) }];
    const facts = buildFacts({ ...base, body: 'b'.repeat(20_000), files, specs });
    expect(facts.fileListed).toBe(50);
    expect(facts.specs).toHaveLength(1);
    expect(facts.specs[0]?.content.endsWith('… [truncated]')).toBe(true);
    expect(factsLength(facts)).toBeLessThanOrEqual(MAX_FACT_CHARS);
    const user = buildBriefMessages(facts)[1]?.content ?? '';
    expect(user.length).toBeLessThanOrEqual(MAX_FACT_CHARS);
  });

  it('NFR-5: cuts the file-list tail when even the listing is too long, and drops the specs', () => {
    const files = Array.from({ length: 300 }, (_, i) => ({
      path: `src/${'deep/'.repeat(30)}file${i}.ts`,
      additions: 1,
      deletions: 1,
    }));
    const facts = buildFacts({
      ...base,
      body: 'b'.repeat(9_000),
      issue: { number: 1, title: 't', body: 'i'.repeat(9_000) },
      blast: {
        changed_symbols: Array.from({ length: 400 }, (_, i) => ({ name: `sym${i}`, file: 'src/a.ts', kind: 'function' })),
        downstream: [],
        summary: null,
      },
      files,
      specs: [{ path: 'docs/spec.md', content: 'y'.repeat(5_000) }],
    });
    expect(facts.fileListed).toBeLessThan(300);
    expect(facts.filesText.endsWith('… [truncated]')).toBe(true);
    expect(facts.specs).toEqual([]);
    expect(buildBriefMessages(facts)[1]?.content.length).toBeLessThanOrEqual(MAX_FACT_CHARS);
  });
});

describe('collectSpecPaths', () => {
  it('D-7: agent paths flattened in agent order, skill paths kept one list per skill', () => {
    const out = collectSpecPaths(
      [{ contextPaths: ['a.md'] }, { contextPaths: [] }, { contextPaths: ['b.md', 'c.md'] }],
      [[['s1.md'], ['s2.md', 's3.md']], [], [['s4.md']]],
    );
    expect(out).toEqual({
      agentPaths: ['a.md', 'b.md', 'c.md'],
      skillPaths: [['s1.md'], ['s2.md', 's3.md'], ['s4.md']],
    });
  });

  it('D-7: no agents gives empty lists', () => {
    expect(collectSpecPaths([], [])).toEqual({ agentPaths: [], skillPaths: [] });
  });
});

describe('validateBrief: file summaries (Files changed "What this does")', () => {
  const prFiles = new Set(PR_FILES.map((f) => f.path));

  it('keeps summaries for PR files only — not blast-only or unknown paths', () => {
    const v = validateBrief(
      output({
        file_summaries: [
          { file: 'src/config.ts', summary: 'Adds the rate-limit settings.' },
          { file: 'src/server.ts', summary: 'blast-only caller' },
          { file: 'src/made-up.ts', summary: 'invented' },
        ],
      }),
      known,
      prFiles,
    );
    expect(v.file_summaries).toEqual([{ file: 'src/config.ts', summary: 'Adds the rate-limit settings.' }]);
  });

  it('normalizes ./, keeps the first summary per file and drops empty text', () => {
    const v = validateBrief(
      output({
        file_summaries: [
          { file: './src/config.ts', summary: '  first  ' },
          { file: 'src/config.ts', summary: 'second' },
          { file: 'package.json', summary: '   ' },
        ],
      }),
      known,
      prFiles,
    );
    expect(v.file_summaries).toEqual([{ file: 'src/config.ts', summary: 'first' }]);
  });

  it(`caps the count at ${MAX_FILE_SUMMARIES} and each summary's length`, () => {
    const many = Array.from({ length: MAX_FILE_SUMMARIES + 5 }, (_, i) => ({ path: `src/f${i}.ts` }));
    const v = validateBrief(
      output({ file_summaries: many.map((f) => ({ file: f.path, summary: 'x'.repeat(1000) })) }),
      new Set(many.map((f) => f.path)),
    );
    expect(v.file_summaries).toHaveLength(MAX_FILE_SUMMARIES);
    expect(v.file_summaries[0]!.summary.length).toBeLessThanOrEqual(MAX_FILE_SUMMARY_CHARS);
  });

  it('tolerates a model output without file_summaries', () => {
    const { file_summaries: _omit, ...rest } = output({});
    expect(validateBrief(rest as BriefModelOutput, known).file_summaries).toEqual([]);
  });
});

describe('line grounding: hunk ranges (Review focus never defaults to line 1)', () => {
  it('hunkRanges reads new-side ranges from @@ headers only', () => {
    const patch = '@@ -0,0 +1,40 @@\n+a\n@@ -10,3 +52,5 @@ fn()\n-x\n+y\n@@ -90 +97 @@\n+z\n@@ -5,2 +60,0 @@\n-gone';
    expect(hunkRanges(patch)).toEqual([
      { start: 1, end: 40 },
      { start: 52, end: 56 },
      { start: 97, end: 97 },
      { start: 60, end: 60 },
    ]);
    expect(hunkRanges(null)).toEqual([]);
  });

  const prLines = new Map([
    ['src/middleware/ratelimit.ts', [{ start: 24, end: 55 }]],
    ['src/config.ts', [{ start: 10, end: 14 }]],
    ['package.json', []],
  ]);

  it('snaps a focus line outside the changed ranges (the placeholder 1) to the first changed line', () => {
    const v = validateBrief(
      output({
        review_focus: [
          { file: 'src/config.ts', line: 1, reason: 'placeholder' },
          { file: 'src/middleware/ratelimit.ts', line: 52, reason: 'inside a hunk' },
          { file: 'src/server.ts', line: 88, reason: 'blast-only caller line kept' },
        ],
      }),
      known,
      prLines,
    );
    expect(v.review_focus.map((f) => `${f.file}:${f.line}`)).toEqual([
      'src/config.ts:10',
      'src/middleware/ratelimit.ts:52',
      'src/server.ts:88',
    ]);
  });

  it('keeps a risk ref but drops a line range that is outside the hunks', () => {
    const v = validateBrief(
      output({
        risks: [risk('r', [{ file: 'src/config.ts', start_line: 1, end_line: 2 }, { file: 'src/middleware/ratelimit.ts', start_line: 40, end_line: 52 }])],
      }),
      known,
      prLines,
    );
    expect(v.risks[0]!.file_refs).toEqual([
      { file: 'src/config.ts' },
      { file: 'src/middleware/ratelimit.ts', start_line: 40, end_line: 52 },
    ]);
  });

  it('lists the line ranges in the facts as numbers', () => {
    const facts = buildFacts({
      title: 't',
      body: null,
      intent: null,
      issue: null,
      blast: null,
      specs: [],
      missing: [],
      files: [{ path: 'src/config.ts', additions: 4, deletions: 0, changedLines: [{ start: 10, end: 14 }, { start: 30, end: 30 }] }],
    });
    expect(facts.filesText).toContain('src/config.ts +4 -0');
    expect(facts.filesText).toContain('lines 10-14,30');
  });
});
