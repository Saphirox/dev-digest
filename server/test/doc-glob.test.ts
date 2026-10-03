import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTEXT_GLOB,
  compileGlob,
  invalidContextPaths,
  isSafeRelPath,
  matchesGlob,
} from '../src/lib/doc-glob.js';
import { loadConfig } from '../src/platform/config.js';

describe('matchesGlob (default glob)', () => {
  it.each([
    'specs/a.md',
    'docs/a.md',
    'insights/a.md',
    'docs/specs/x.md',
    'server/docs/deep/nested/x.md',
    '.devdigest/insights/q2.md',
    'a/b/specs/c.md',
  ])('AC-1: matches %s', (p) => {
    expect(matchesGlob(p, DEFAULT_CONTEXT_GLOB)).toBe(true);
  });

  it.each([
    'README.md',
    'src/app.ts',
    'docs/a.txt',
    'docs/a.mdx',
    'mydocs/a.md',
    'docs.md',
    'specs',
  ])('AC-1: rejects %s', (p) => {
    expect(matchesGlob(p, DEFAULT_CONTEXT_GLOB)).toBe(false);
  });
});

describe('compileGlob', () => {
  it('a single star stays inside one segment', () => {
    expect(matchesGlob('docs/a.md', 'docs/*.md')).toBe(true);
    expect(matchesGlob('docs/x/a.md', 'docs/*.md')).toBe(false);
  });
  it('escapes regex specials literally', () => {
    expect(matchesGlob('docs/a+b.md', 'docs/a+b.md')).toBe(true);
    expect(matchesGlob('docs/aab.md', 'docs/a+b.md')).toBe(false);
  });
  it('supports alternatives', () => {
    const re = compileGlob('{a,b}/*.md');
    expect(re.test('a/x.md')).toBe(true);
    expect(re.test('c/x.md')).toBe(false);
  });
});

describe('isSafeRelPath', () => {
  it.each(['docs/a.md', 'a.md', '.devdigest/insights/q2.md'])('accepts %s', (p) => {
    expect(isSafeRelPath(p)).toBe(true);
  });
  it.each([
    '',
    '/etc/passwd.md',
    '../x.md',
    'docs/../../etc/passwd.md',
    'specs/../../../etc/passwd.md',
    'docs/./a.md',
    'docs//a.md',
    'docs\\a.md',
    'docs/a\0.md',
    'docs/a.txt',
    'docs/',
  ])('rejects %j', (p) => {
    expect(isSafeRelPath(p)).toBe(false);
  });
});

describe('invalidContextPaths', () => {
  it('EC-3: returns paths outside the glob or not markdown', () => {
    expect(
      invalidContextPaths(['docs/ok.md', 'src/app.ts', 'src/app.md', 'docs/x.txt'], DEFAULT_CONTEXT_GLOB),
    ).toEqual(['src/app.ts', 'src/app.md', 'docs/x.txt']);
  });
  it('returns [] for a clean list', () => {
    expect(invalidContextPaths(['specs/a.md'], DEFAULT_CONTEXT_GLOB)).toEqual([]);
  });
});

describe('config CONTEXT_GLOB', () => {
  it('defaults and overrides', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).contextGlob).toBe(DEFAULT_CONTEXT_GLOB);
    expect(loadConfig({ NODE_ENV: 'test', CONTEXT_GLOB: '' } as NodeJS.ProcessEnv).contextGlob).toBe(
      DEFAULT_CONTEXT_GLOB,
    );
    expect(loadConfig({ NODE_ENV: 'test', CONTEXT_GLOB: 'notes/*.md' } as NodeJS.ProcessEnv).contextGlob).toBe(
      'notes/*.md',
    );
  });
});
