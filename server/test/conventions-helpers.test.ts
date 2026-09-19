import { describe, it, expect } from 'vitest';
import {
  adjustConfidence,
  buildSkillDraft,
  locateSnippet,
  normalizeRule,
  renderSample,
  resolveSampledPath,
  slugify,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRecord } from '../src/modules/conventions/ports.js';

const FILE = [
  "import { db } from './db';",
  '',
  'export async function load(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
  '',
  'export async function other(id: string) {',
  '  const user = await db.users.find(id);',
  '}',
].join('\n');

describe('renderSample', () => {
  it('prefixes 1-based line numbers and lists included files', () => {
    const { text, included } = renderSample([{ path: 'a.ts', content: 'x\ny' }]);
    expect(included).toEqual(['a.ts']);
    expect(text).toContain('=== FILE: a.ts ===\n1| x\n2| y');
  });

  it('caps lines per file and skips files past the total budget', () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const { text } = renderSample([{ path: 'long.ts', content: long }]);
    expect(text).toContain('220| line 219');
    expect(text).not.toContain('line 220');

    const big = 'x'.repeat(11_000);
    const files = Array.from({ length: 12 }, (_, i) => ({ path: `f${i}.ts`, content: big }));
    expect(renderSample(files).included.length).toBeLessThan(12);
  });
});

describe('resolveSampledPath', () => {
  const sampled = ['src/api/users.ts', 'src/lib/redis.ts', 'package.json'];
  it('accepts an exact path, a leading ./, or a unique suffix', () => {
    expect(resolveSampledPath('src/api/users.ts', sampled)).toBe('src/api/users.ts');
    expect(resolveSampledPath('./package.json', sampled)).toBe('package.json');
    expect(resolveSampledPath('lib/redis.ts', sampled)).toBe('src/lib/redis.ts');
  });
  it('rejects unknown or ambiguous paths', () => {
    expect(resolveSampledPath('src/other.ts', sampled)).toBeNull();
    expect(resolveSampledPath('x.ts', ['a/x.ts', 'b/x.ts'])).toBeNull();
  });
});

describe('locateSnippet', () => {
  it('finds a snippet ignoring whitespace and case, and re-reads it from the file', () => {
    const hit = locateSnippet(FILE, 'const USER = await db.users.find(id);\n   const posts=await db.posts.findMany({userId: id});', 4);
    expect(hit).toEqual({
      line: 4,
      lineEnd: 5,
      snippet: '  const user = await db.users.find(id);\n  const posts = await db.posts.findMany({ userId: id });',
    });
  });

  it('corrects a wrong line number to the nearest real hit', () => {
    expect(locateSnippet(FILE, 'const user = await db.users.find(id);', 9)?.line).toBe(10);
    expect(locateSnippet(FILE, 'const user = await db.users.find(id);', 1)?.line).toBe(4);
  });

  it('drops snippets that are too short or not in the file', () => {
    expect(locateSnippet(FILE, 'db', 1)).toBeNull();
    expect(locateSnippet(FILE, 'await fetch(url).then(r => r.json())', 1)).toBeNull();
  });
});

describe('adjustConfidence', () => {
  it('penalises a rule seen in only one file and clamps to 0..1', () => {
    expect(adjustConfidence(0.9, 1)).toBe(0.63);
    expect(adjustConfidence(0.9, 7)).toBe(0.9);
    expect(adjustConfidence(1.4, null)).toBe(1);
  });
});

describe('normalizeRule / slugify', () => {
  it('reduces rules to comparable words and slugs', () => {
    expect(normalizeRule('Always use async/await, NOT .then()!')).toBe(normalizeRule('always use async await not then'));
    expect(slugify('Always use async/await instead of .then() chains')).toBe('always-use-async-await-instead-of-then-chains');
  });
});

describe('buildSkillDraft', () => {
  const row = (rule: string, path: string, line: number, snippet: string): ConventionRecord => ({
    id: rule,
    rule,
    category: 'general',
    rationale: null,
    evidencePath: path,
    evidenceSnippet: snippet,
    evidenceLine: line,
    confidence: 0.9,
    occurrences: 3,
    status: 'accepted',
    createdAt: new Date(0),
  });

  it('names it repo-conventions and writes one section per rule with its evidence', () => {
    const draft = buildSkillDraft('payments-api', [
      row('Always use async/await instead of .then() chains', 'src/api/users.ts', 23, 'const u = await x();'),
    ]);
    expect(draft).toMatchObject({
      name: 'repo-conventions',
      description: '1 house convention extracted from payments-api',
      type: 'convention',
      convention_count: 1,
    });
    expect(draft.body).toContain('# repo-conventions');
    expect(draft.body).toContain('## always-use-async-await-instead-of-then-chains');
    expect(draft.body).toContain('Detected in `src/api/users.ts:23`:');
    expect(draft.body).toContain('const u = await x();');
  });
});
