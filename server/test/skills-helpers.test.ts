import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import {
  parseFrontmatter,
  parseSkillUpload,
  pickSkillCore,
} from '../src/modules/skills/import-parser.js';
import { isSkillConfigChange } from '../src/modules/skills/helpers.js';

const md = (s: string) => strToU8(s);

describe('parseFrontmatter', () => {
  it('reads flat known keys and strips the block from the body', () => {
    const { meta, body } = parseFrontmatter(
      '---\nname: "semver"\ndescription: Use when versions change\ntype: rubric\nowner: x\n---\n# Semver\nBody',
    );
    expect(meta).toEqual({ name: 'semver', description: 'Use when versions change', type: 'rubric' });
    expect(body).toBe('# Semver\nBody');
  });

  it('returns the whole text as body when there is no frontmatter', () => {
    expect(parseFrontmatter('# Title\ntext')).toEqual({ meta: {}, body: '# Title\ntext' });
  });
});

describe('parseSkillUpload — markdown', () => {
  it('falls back to heading, first paragraph and custom type', () => {
    const r = parseSkillUpload(
      'corner-cases.md',
      md('# Corner cases\n\nFlag missing boundary tests.\n\n- empty input'),
    );
    expect(r.ok && r.preview).toMatchObject({
      name: 'Corner cases',
      description: 'Flag missing boundary tests.',
      type: 'custom',
      source: 'imported_url',
      ignored_entries: [],
    });
  });

  it('uses the filename stem when there is no heading', () => {
    const r = parseSkillUpload('mocking-smells.md', md('Avoid mocking what you own.'));
    expect(r.ok && r.preview.name).toBe('mocking-smells');
  });

  it('rejects an invalid frontmatter type by falling back to custom', () => {
    const r = parseSkillUpload('a.md', md('---\ntype: magic\n---\nbody'));
    expect(r.ok && r.preview.type).toBe('custom');
  });

  it('rejects an empty body and unsupported extensions', () => {
    expect(parseSkillUpload('a.md', md('---\nname: x\n---\n  ')).ok).toBe(false);
    expect(parseSkillUpload('a.txt', md('hello')).ok).toBe(false);
  });
});

describe('parseSkillUpload — archive', () => {
  it('imports SKILL.md and lists every other member as ignored, warning on executables', () => {
    const zip = zipSync({
      'semver/SKILL.md': md('---\nname: semver-discipline\ntype: convention\n---\nBump major on breaks.'),
      'semver/README.md': md('# readme'),
      'semver/install.sh': md('rm -rf /'),
    });
    const r = parseSkillUpload('semver.zip', zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.name).toBe('semver-discipline');
    expect(r.preview.type).toBe('convention');
    expect(r.preview.body).toBe('Bump major on breaks.');
    expect(r.preview.ignored_entries.sort()).toEqual(['semver/README.md', 'semver/install.sh']);
    expect(r.preview.warnings.join(' ')).toContain('semver/install.sh');
  });

  it('parses the committed import sample (docs/skills/semver-discipline.zip)', () => {
    const bytes = readFileSync(new URL('../../docs/skills/semver-discipline.zip', import.meta.url));
    const r = parseSkillUpload('semver-discipline.zip', new Uint8Array(bytes));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview).toMatchObject({ name: 'semver-discipline', type: 'rubric' });
    expect(r.preview.body.startsWith('## Which bump does this change force?')).toBe(true);
    expect(r.preview.ignored_entries.sort()).toEqual([
      'semver-discipline/README.md',
      'semver-discipline/install.sh',
    ]);
    expect(r.preview.warnings).toHaveLength(1);
  });

  it('fails with the member list when the archive has no markdown', () => {
    const r = parseSkillUpload('x.zip', zipSync({ 'run.sh': md('echo') }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details).toEqual({ members: ['run.sh'] });
  });

  it('detects a zip by its magic bytes even without a .zip name', () => {
    const r = parseSkillUpload('upload', zipSync({ 'skill.md': md('# S\nbody') }));
    expect(r.ok && r.preview.name).toBe('S');
  });

  it('rejects an archive with too many members', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 201; i++) files[`f${i}.txt`] = md('x');
    const r = parseSkillUpload('big.zip', zipSync(files));
    expect(r.ok).toBe(false);
  });

  it('rejects bytes that are not a readable archive', () => {
    expect(parseSkillUpload('broken.zip', md('not a zip')).ok).toBe(false);
  });
});

describe('pickSkillCore', () => {
  it('prefers SKILL.md, then non-README markdown, then README; shallowest first', () => {
    expect(pickSkillCore(['a/README.md', 'a/b/SKILL.md', 'a/rules.md'])?.name).toBe('a/b/SKILL.md');
    expect(pickSkillCore(['README.md', 'deep/rules.md'])?.name).toBe('deep/rules.md');
    expect(pickSkillCore(['README.md', '__MACOSX/._x.md'])?.name).toBe('README.md');
  });

  it('warns when two candidates tie', () => {
    const r = pickSkillCore(['a.md', 'b.md']);
    expect(r?.name).toBe('a.md');
    expect(r?.warnings).toHaveLength(1);
  });
});

describe('isSkillConfigChange', () => {
  const existing = { name: 'n', description: 'd', type: 'custom' as const, body: 'b' };

  it('is true when prompt-affecting text changes', () => {
    expect(isSkillConfigChange(existing, { body: 'b2' })).toBe(true);
    expect(isSkillConfigChange(existing, { type: 'rubric' })).toBe(true);
  });

  it('is false for an enabled toggle or a no-op', () => {
    expect(isSkillConfigChange(existing, { enabled: false })).toBe(false);
    expect(isSkillConfigChange(existing, { body: 'b', name: 'n' })).toBe(false);
  });
});
