import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsRunnerBundle } from '../src/adapters/runner-bundle/fs.js';

describe('FsRunnerBundle', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });
  const tmp = async () => {
    const d = await mkdtemp(join(tmpdir(), 'runner-bundle-'));
    dirs.push(d);
    return d;
  };

  it('AC-3: reads every file of the dist directory with a relative posix path', async () => {
    const dir = await tmp();
    await writeFile(join(dir, 'index.js'), '// entry');
    await writeFile(join(dir, '300.index.js'), '// chunk');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'a.json'), '{}');
    expect(await new FsRunnerBundle(dir).read()).toEqual([
      { path: '300.index.js', contents: '// chunk' },
      { path: 'index.js', contents: '// entry' },
      { path: 'sub/a.json', contents: '{}' },
    ]);
  });

  it('EC-7: null when the directory is missing or has no index.js', async () => {
    const dir = await tmp();
    expect(await new FsRunnerBundle(join(dir, 'nope')).read()).toBeNull();
    await writeFile(join(dir, 'package.json'), '{}');
    expect(await new FsRunnerBundle(dir).read()).toBeNull();
  });
});
