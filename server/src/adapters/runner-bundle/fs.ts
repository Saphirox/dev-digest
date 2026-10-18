import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Reads the built agent-runner directory (`dist/`) from disk: every file, as
 * `{ path (posix, relative to dist), contents }`. Null when `index.js` is
 * missing, i.e. the runner is not built. Structurally implements
 * `RunnerBundleSource` (`modules/ci/ports.ts`) — no import, so the adapter
 * stays free of module code.
 */
export class FsRunnerBundle {
  constructor(private readonly dir: string) {}

  async read(): Promise<{ path: string; contents: string }[] | null> {
    let entries: string[];
    try {
      entries = (await readdir(this.dir, { recursive: true, withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name).slice(this.dir.length + 1).split('\\').join('/'))
        .sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    if (!entries.includes('index.js')) return null;
    return Promise.all(
      entries.map(async (path) => ({ path, contents: await readFile(join(this.dir, path), 'utf8') })),
    );
  }
}
