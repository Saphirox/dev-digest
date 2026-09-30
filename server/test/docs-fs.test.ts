import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsDocSource } from '../src/adapters/docs/fs.js';
import { DEFAULT_CONTEXT_GLOB } from '../src/lib/doc-glob.js';

let base: string;
let root: string;
let outside: string;
const src = new FsDocSource();

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'docs-fs-'));
  root = join(base, 'clone');
  outside = join(base, 'outside');
  await mkdir(join(root, 'specs'), { recursive: true });
  await mkdir(join(root, 'docs', 'specs'), { recursive: true });
  await mkdir(join(root, '.devdigest', 'insights'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'pkg', 'docs'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await writeFile(join(root, '.git', 'config'), '[remote "origin"] url = https://x-access-token:ghp_TOKEN@github.com/a/b');
  await writeFile(join(root, '.git', 'notes.md'), 'inside .git');
  await writeFile(join(root, 'specs', 'public-api.md'), '# Public API\n');
  await writeFile(join(root, 'docs', 'specs', 'payments.md'), '# Payments\n');
  await writeFile(join(root, '.devdigest', 'insights', 'q2.md'), '# Q2\n');
  await writeFile(join(root, 'node_modules', 'pkg', 'docs', 'skip.md'), 'skip');
  await writeFile(join(root, 'src', 'notes.md'), 'not in a doc folder');
  await writeFile(join(root, 'docs', 'readme.txt'), 'not markdown');
  await writeFile(join(outside, 'secret.md'), 'TOP SECRET');
  await symlink(join(outside, 'secret.md'), join(root, 'docs', 'notes.md'));
  await symlink(outside, join(root, 'docs', 'linked-dir'));
  // In-clone symlinks: they resolve INSIDE the root, so a containment check alone passes them.
  await symlink(join(root, '.git', 'config'), join(root, 'docs', 'git-config.md'));
  await symlink('../specs/public-api.md', join(root, 'docs', 'inner-link.md'));
  await symlink(join(root, 'specs'), join(root, 'docs', 'inner-dir'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('FsDocSource.list', () => {
  it('AC-1: lists matching markdown files, sorted, posix paths, incl. dot-dirs', async () => {
    const files = await src.list(root, DEFAULT_CONTEXT_GLOB);
    expect(files?.map((f) => f.path)).toEqual([
      '.devdigest/insights/q2.md',
      'docs/specs/payments.md',
      'specs/public-api.md',
    ]);
    expect(files?.[2]?.size).toBe('# Public API\n'.length);
  });

  it('AC-2: reflects files present at call time (no cache)', async () => {
    await writeFile(join(root, 'docs', 'late.md'), 'late');
    expect((await src.list(root, DEFAULT_CONTEXT_GLOB))?.map((f) => f.path)).toContain('docs/late.md');
    await rm(join(root, 'docs', 'late.md'));
    expect((await src.list(root, DEFAULT_CONTEXT_GLOB))?.map((f) => f.path)).not.toContain('docs/late.md');
  });

  it('NFR-1: never lists symlinked files or files behind a symlinked directory', async () => {
    const paths = (await src.list(root, DEFAULT_CONTEXT_GLOB))?.map((f) => f.path) ?? [];
    expect(paths).not.toContain('docs/notes.md');
    expect(paths.some((p) => p.includes('linked-dir'))).toBe(false);
  });

  it('EC-8: returns null when the root does not exist', async () => {
    expect(await src.list(join(base, 'nope'), DEFAULT_CONTEXT_GLOB)).toBeNull();
  });

  it('EC-8: returns null when the root is a file', async () => {
    expect(await src.list(join(root, 'specs', 'public-api.md'), DEFAULT_CONTEXT_GLOB)).toBeNull();
  });
});

describe('FsDocSource.read', () => {
  it('reads a regular file', async () => {
    expect(await src.read(root, 'specs/public-api.md')).toBe('# Public API\n');
  });

  it('NFR-1: a symlink pointing outside the root reads as null', async () => {
    expect(await src.read(root, 'docs/notes.md')).toBeNull();
  });

  it('NFR-1: a file behind a symlinked directory reads as null', async () => {
    expect(await src.read(root, 'docs/linked-dir/secret.md')).toBeNull();
  });

  it('NFR-1: a symlink to .git/config INSIDE the root reads as null', async () => {
    expect(await src.read(root, 'docs/git-config.md')).toBeNull();
  });

  it('NFR-1: any in-root symlinked file or directory reads as null', async () => {
    expect(await src.read(root, 'docs/inner-link.md')).toBeNull();
    expect(await src.read(root, 'docs/inner-dir/public-api.md')).toBeNull();
  });

  it('NFR-1: a path under .git reads as null even when it is a regular file', async () => {
    expect(await src.read(root, '.git/notes.md')).toBeNull();
    expect(await src.read(root, '.git/config')).toBeNull();
  });

  it('NFR-5: maxBytes reads only a prefix of the file', async () => {
    expect(await src.read(root, 'specs/public-api.md', 4)).toBe('# Pu');
    expect(await src.read(root, 'specs/public-api.md', 10_000)).toBe('# Public API\n');
  });

  it.each([
    'specs/../../outside/secret.md',
    '../outside/secret.md',
    '/etc/passwd.md',
    'docs\\notes.md',
    'specs/public-api.txt',
    '',
  ])('NFR-2: rejects unsafe path %j without reading', async (p) => {
    expect(await src.read(root, p)).toBeNull();
  });

  it('returns null (never throws) for a missing file, a directory or a missing root', async () => {
    expect(await src.read(root, 'specs/missing.md')).toBeNull();
    await mkdir(join(root, 'docs', 'dir.md'), { recursive: true });
    expect(await src.read(root, 'docs/dir.md')).toBeNull();
    expect(await src.read(join(base, 'nope'), 'specs/public-api.md')).toBeNull();
  });
});
