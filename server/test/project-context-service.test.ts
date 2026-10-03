import { describe, it, expect } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { ProjectContextRepo, TokenCounter } from '../src/modules/project-context/ports.js';
import { MAX_DOC_BYTES, MAX_DOC_RUN_BYTES } from '../src/modules/project-context/constants.js';
import { DEFAULT_CONTEXT_GLOB } from '../src/lib/doc-glob.js';
import { NotFoundError } from '../src/platform/errors.js';
import { MockDocSource } from '../src/adapters/mocks.js';

const REPO: ProjectContextRepo = { id: 'r1', owner: 'acme', name: 'app' };

/** `files: null` = no clone. A file value of `null` = listed but unreadable. */
function build(opts: {
  files: Record<string, string | null> | null;
  head?: () => Promise<string>;
  repo?: ProjectContextRepo | undefined;
  tokens?: TokenCounter;
}) {
  const docs = new MockDocSource(opts.files);
  const reads = docs.reads;
  const readLimits = docs.readLimits;
  const service = new ProjectContextService({
    docs,
    tokens: opts.tokens ?? {
      count: (t) => t.length,
      truncate: (t, max) => ({ text: t.slice(0, max), total: t.length }),
    },
    clones: {
      rootFor: () => '/clone',
      head: opts.head ?? (async () => 'e694ac8'),
    },
    repos: { find: async () => ('repo' in opts ? opts.repo : REPO) },
    glob: DEFAULT_CONTEXT_GLOB,
  });
  return { service, reads, readLimits };
}

describe('ProjectContextService.list', () => {
  it('AC-1: returns type, size and tokens per file', async () => {
    const { service } = build({ files: { 'docs/specs/a.md': 'abcd', 'insights/b.md': 'xy' } });
    expect(await service.list('w', 'r1')).toEqual({
      cloned: true,
      files: [
        { path: 'docs/specs/a.md', type: 'specs', size: 4, tokens: 4 },
        { path: 'insights/b.md', type: 'insights', size: 2, tokens: 2 },
      ],
    });
  });

  it('EC-2: an unreadable file has tokens null (never 0)', async () => {
    const { service } = build({ files: { 'docs/a.md': null } });
    expect((await service.list('w', 'r1')).files[0]!.tokens).toBeNull();
  });

  it('EC-2/NFR-1: a file over the byte cap is still listed, with tokens null, and is never read', async () => {
    const { service, reads } = build({
      files: { 'docs/huge.md': 'x'.repeat(MAX_DOC_BYTES + 1), 'docs/small.md': 'abc' },
    });
    const { files } = await service.list('w', 'r1');
    expect(files).toEqual([
      { path: 'docs/huge.md', type: 'docs', size: MAX_DOC_BYTES + 1, tokens: null },
      { path: 'docs/small.md', type: 'docs', size: 3, tokens: 3 },
    ]);
    expect(reads).toEqual(['docs/small.md']);
  });

  it('EC-8: no clone reports cloned:false with no files', async () => {
    const { service } = build({ files: null });
    expect(await service.list('w', 'r1')).toEqual({ cloned: false, files: [] });
  });

  it('an empty clone is cloned:true with no files', async () => {
    const { service } = build({ files: {} });
    expect(await service.list('w', 'r1')).toEqual({ cloned: true, files: [] });
  });

  it('404 for an unknown repo', async () => {
    const { service } = build({ files: {}, repo: undefined });
    await expect(service.list('w', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ProjectContextService.readFile', () => {
  it('AC-4: returns the content of a listed file', async () => {
    const { service } = build({ files: { 'specs/public-api.md': '# API' } });
    expect(await service.readFile('w', 'r1', 'specs/public-api.md')).toMatchObject({
      path: 'specs/public-api.md',
      type: 'specs',
      content: '# API',
      tokens: 5,
    });
  });

  it('NFR-2: a path not in the list is a generic 404 and is never read', async () => {
    const { service, reads } = build({ files: { 'specs/public-api.md': 'x' } });
    const err = await service
      .readFile('w', 'r1', 'specs/../../../etc/passwd.md')
      .catch((e: NotFoundError) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).message).toBe('Document not found');
    expect(reads).toEqual([]);
  });

  it('NFR-1: a listed file the adapter refuses to read (symlink escape) is a 404', async () => {
    const { service } = build({ files: { 'docs/notes.md': null } });
    await expect(service.readFile('w', 'r1', 'docs/notes.md')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('NFR-5: an oversized doc previews as a bounded prefix with the truncation marker and tokens null', async () => {
    const { service, readLimits } = build({ files: { 'docs/huge.md': 'x'.repeat(MAX_DOC_BYTES + 500) } });
    const file = await service.readFile('w', 'r1', 'docs/huge.md');
    expect(readLimits).toEqual([MAX_DOC_BYTES + 1]);
    expect(file.tokens).toBeNull();
    expect(file.content!.length).toBeLessThan(MAX_DOC_BYTES + 100);
    expect(file.content!.endsWith('[truncated: file exceeds the size limit]')).toBe(true);
  });

  it('EC-8: no clone is a 404', async () => {
    const { service } = build({ files: null });
    await expect(service.readFile('w', 'r1', 'docs/a.md')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ProjectContextService.loadForRun', () => {
  it('EC-1: returns undefined when nothing is attached', async () => {
    const { service, reads } = build({ files: { 'docs/a.md': 'a' } });
    expect(await service.loadForRun({ repo: REPO, agentPaths: [], skillPaths: [[], []] })).toBeUndefined();
    expect(reads).toEqual([]);
  });

  it('AC-17/18/19/24: reads in merged order once each, reports tokens and sha', async () => {
    const { service, reads } = build({
      files: { 'docs/architecture.md': 'A'.repeat(212), 'specs/public-api.md': 'B'.repeat(105) },
    });
    const run = await service.loadForRun({
      repo: REPO,
      agentPaths: ['docs/architecture.md'],
      skillPaths: [['specs/public-api.md', 'docs/architecture.md']],
    });
    expect(reads).toEqual(['docs/architecture.md', 'specs/public-api.md']);
    expect(run).toMatchObject({
      specsRead: ['docs/architecture.md', 'specs/public-api.md'],
      specsTokens: 317,
      sha: 'e694ac8',
      notCloned: false,
      missing: [],
    });
    expect(run!.docs.map((d) => d.path)).toEqual(['docs/architecture.md', 'specs/public-api.md']);
  });

  it('EC-4: a missing file is skipped, recorded missing, and left out of specsRead (AC-24)', async () => {
    const { service } = build({ files: { 'docs/b.md': 'bbb' } });
    const run = await service.loadForRun({
      repo: REPO,
      agentPaths: ['docs/gone.md', 'docs/b.md'],
      skillPaths: [],
    });
    expect(run!.entries).toEqual([
      { path: 'docs/gone.md', tokens: null, status: 'missing' },
      { path: 'docs/b.md', tokens: 3, status: 'included' },
    ]);
    expect(run!.specsRead).toEqual(['docs/b.md']);
    expect(run!.missing).toEqual(['docs/gone.md']);
    expect(run!.notCloned).toBe(false);
    expect(run!.sha).toBe('e694ac8');
  });

  it('EC-9: no clone → every path missing, notCloned, no sha, no docs', async () => {
    const { service } = build({ files: null });
    const run = await service.loadForRun({ repo: REPO, agentPaths: ['docs/a.md'], skillPaths: [['specs/b.md']] });
    expect(run).toMatchObject({ docs: [], notCloned: true, sha: null, specsTokens: 0 });
    expect(run!.entries.map((e) => e.status)).toEqual(['missing', 'missing']);
  });

  it('a clone whose attached files are all gone is NOT notCloned', async () => {
    const { service } = build({ files: {} });
    const run = await service.loadForRun({ repo: REPO, agentPaths: ['docs/a.md'], skillPaths: [] });
    expect(run!.notCloned).toBe(false);
  });

  it('a failing head() yields sha null and does not fail the run', async () => {
    const { service } = build({
      files: { 'docs/a.md': 'a' },
      head: async () => {
        throw new Error('boom /Users/me/host/path');
      },
    });
    const run = await service.loadForRun({ repo: REPO, agentPaths: ['docs/a.md'], skillPaths: [] });
    expect(run!.sha).toBeNull();
    expect(run!.docs).toHaveLength(1);
  });

  it('NFR-5: an oversized doc is truncated with the marker and status truncated', async () => {
    const { service } = build({ files: { 'docs/big.md': 'x'.repeat(9000) } });
    const run = await service.loadForRun({ repo: REPO, agentPaths: ['docs/big.md'], skillPaths: [] });
    expect(run!.entries).toEqual([{ path: 'docs/big.md', tokens: 8000, status: 'truncated' }]);
    expect(run!.docs[0]!.content.endsWith('[truncated: 8000 of 9000 tokens]')).toBe(true);
  });

  it('NFR-5: a run reads a bounded prefix; a doc cut by the byte bound is truncated with a marker', async () => {
    const { service, readLimits } = build({ files: { 'docs/huge.md': 'x'.repeat(MAX_DOC_RUN_BYTES * 10) } });
    const run = await service.loadForRun({ repo: REPO, agentPaths: ['docs/huge.md'], skillPaths: [] });
    expect(readLimits).toEqual([MAX_DOC_RUN_BYTES + 1]);
    expect(run!.entries[0]).toMatchObject({ path: 'docs/huge.md', status: 'truncated' });
    expect(run!.docs[0]!.content).toContain('[truncated:');
  });

  it('NFR-5: a doc cut by the byte bound stays truncated even when its prefix fits the token cap', async () => {
    const { service } = build({
      files: { 'docs/spaces.md': ' '.repeat(MAX_DOC_RUN_BYTES + 10) },
      tokens: { count: () => 1, truncate: (t) => ({ text: t, total: 1 }) },
    });
    const run = await service.loadForRun({ repo: REPO, agentPaths: ['docs/spaces.md'], skillPaths: [] });
    expect(run!.entries).toEqual([{ path: 'docs/spaces.md', tokens: 1, status: 'truncated' }]);
    expect(run!.docs[0]!.content.endsWith('[truncated: file exceeds the size limit]')).toBe(true);
  });
});
