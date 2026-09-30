import { describe, it, expect } from 'vitest';
import {
  applyBudget,
  docTypeFor,
  mergeContextPaths,
  truncationMarker,
  type TruncateFn,
} from '../src/modules/project-context/helpers.js';

/** 1 char = 1 token; the "text" of an N-token doc is N chars. */
const truncate: TruncateFn = (text, max) => ({ text: text.slice(0, max), total: text.length });
const doc = (n: number) => 'x'.repeat(n);

describe('docTypeFor', () => {
  it.each([
    ['specs/a.md', 'specs'],
    ['docs/a.md', 'docs'],
    ['.devdigest/insights/q2.md', 'insights'],
    ['docs/specs/payments.md', 'specs'], // nearest folder wins
    ['specs/docs/x.md', 'docs'],
    ['server/docs/a.md', 'docs'],
    ['notes/a.md', 'docs'], // custom glob fallback
  ])('EC-6: %s → %s', (path, type) => {
    expect(docTypeFor(path)).toBe(type);
  });

  it('EC-6: a file NAME matching a folder name does not count', () => {
    expect(docTypeFor('insights/specs.md')).toBe('insights');
  });
});

describe('mergeContextPaths', () => {
  it('AC-18: agent paths first, then skills in order', () => {
    expect(mergeContextPaths(['docs/architecture.md'], [['specs/public-api.md', 'docs/architecture.md']])).toEqual([
      'docs/architecture.md',
      'specs/public-api.md',
    ]);
  });
  it('AC-19: a repeated path is kept once at its first position', () => {
    expect(mergeContextPaths(['a.md', 'b.md', 'a.md'], [['c.md', 'b.md'], ['a.md', 'd.md']])).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'd.md',
    ]);
  });
  it('returns [] when nothing is attached', () => {
    expect(mergeContextPaths([], [[], []])).toEqual([]);
  });
});

describe('applyBudget', () => {
  it('AC-24: small docs are included whole; tokens sum the injected content', () => {
    const r = applyBudget(
      [
        { path: 'specs/security-baseline.md', text: doc(212) },
        { path: 'specs/public-api.md', text: doc(105) },
      ],
      truncate,
    );
    expect(r.entries).toEqual([
      { path: 'specs/security-baseline.md', tokens: 212, status: 'included' },
      { path: 'specs/public-api.md', tokens: 105, status: 'included' },
    ]);
    expect(r.tokens).toBe(317);
    expect(r.docs.map((d) => d.content.length)).toEqual([212, 105]);
  });

  it('NFR-5: a doc over 8000 tokens is cut to 8000 plus the marker', () => {
    const r = applyBudget([{ path: 'a.md', text: doc(9500) }], truncate);
    expect(r.entries).toEqual([{ path: 'a.md', tokens: 8000, status: 'truncated' }]);
    expect(r.docs[0]!.content).toBe(`${doc(8000)}\n[truncated: 8000 of 9500 tokens]`);
    expect(r.tokens).toBe(8000);
  });

  it('NFR-6: the doc crossing the 24000 cap is truncated, later docs dropped', () => {
    const r = applyBudget(
      [
        { path: 'a.md', text: doc(8000) },
        { path: 'b.md', text: doc(8000) },
        { path: 'c.md', text: doc(6000) },
        { path: 'd.md', text: doc(300) },
      ],
      truncate,
      8000,
      20000,
    );
    expect(r.entries).toEqual([
      { path: 'a.md', tokens: 8000, status: 'included' },
      { path: 'b.md', tokens: 8000, status: 'included' },
      { path: 'c.md', tokens: 4000, status: 'truncated' },
      { path: 'd.md', tokens: 300, status: 'dropped' },
    ]);
    expect(r.docs.map((d) => d.path)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(r.docs[2]!.content.endsWith(truncationMarker(4000, 6000))).toBe(true);
    expect(r.tokens).toBe(20000);
  });

  it('NFR-6: default caps are 8000 per doc and 24000 per run', () => {
    const r = applyBudget(
      [
        { path: 'a.md', text: doc(9500) },
        { path: 'b.md', text: doc(12000) },
        { path: 'c.md', text: doc(6000) },
        { path: 'd.md', text: doc(300) },
        { path: 'e.md', text: doc(300) },
      ],
      truncate,
    );
    // 8000 + 8000 + 6000 + 300 + 300 = 22600: under the run cap, so nothing is dropped
    expect(r.entries.map((e) => e.status)).toEqual([
      'truncated',
      'truncated',
      'included',
      'included',
      'included',
    ]);
    expect(r.tokens).toBe(22600);
    expect(r.tokens).toBeLessThanOrEqual(24000);
  });

  it('EC-4: an unreadable doc is missing with null tokens and is not injected', () => {
    const r = applyBudget([{ path: 'gone.md', text: null }, { path: 'b.md', text: doc(10) }], truncate);
    expect(r.entries).toEqual([
      { path: 'gone.md', tokens: null, status: 'missing' },
      { path: 'b.md', tokens: 10, status: 'included' },
    ]);
    expect(r.docs.map((d) => d.path)).toEqual(['b.md']);
  });

  it('a doc that exactly fills the run cap leaves later docs dropped', () => {
    const r = applyBudget(
      [
        { path: 'a.md', text: doc(10) },
        { path: 'b.md', text: doc(5) },
      ],
      truncate,
      10,
      10,
    );
    expect(r.entries.map((e) => e.status)).toEqual(['included', 'dropped']);
  });

  it('returns nothing for no input', () => {
    expect(applyBudget([], truncate)).toEqual({ docs: [], entries: [], tokens: 0 });
  });
});
