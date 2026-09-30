/**
 * docs adapter — lists and reads project markdown documents from a repository
 * clone on disk (Project Context, SPEC-0001).
 *
 * Security stance (NFR-1, NFR-2):
 *  - the walk never follows symlinks (files or directories);
 *  - `read` applies the same no-symlink policy: it re-validates the relative
 *    path, refuses any `.git` component (the clone's `.git/config` holds the
 *    token-bearing remote URL), `lstat`s every component under the `realpath` of
 *    the root and rejects a symlink at any level. A symlink that stays inside the
 *    clone is as dangerous as one that leaves it (server INSIGHTS 2026-09-20);
 *  - `read` can be bounded (`maxBytes`) so a huge file is never loaded whole;
 *  - every failure collapses to `null`: an `fs` error message embeds the
 *    absolute host path, so it must never reach a caller or an API body.
 *
 * Structurally implements `DocSource` (declared in
 * `modules/project-context/ports.ts`); this file imports nothing from modules.
 */
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { isSafeRelPath, matchesGlob } from '../../lib/doc-glob.js';

/** Directories never worth walking for docs (local copy — no import from modules). */
const SKIPPED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
]);

export interface DocEntry {
  /** Posix path relative to the root. */
  path: string;
  size: number;
}

export class FsDocSource {
  /**
   * Every file under `root` whose posix-relative path matches `glob`, sorted by
   * path. `null` when `root` is not an existing directory (no clone).
   */
  async list(root: string, glob: string): Promise<DocEntry[] | null> {
    try {
      if (!(await stat(root)).isDirectory()) return null;
    } catch {
      return null;
    }
    const out: DocEntry[] = [];
    await this.walk(root, '', glob, out);
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /**
   * UTF-8 text of `relPath` inside `root` (at most `maxBytes` bytes when given),
   * or `null` for anything unsafe or unreadable.
   */
  async read(root: string, relPath: string, maxBytes?: number): Promise<string | null> {
    if (!isSafeRelPath(relPath)) return null;
    const parts = relPath.split('/');
    if (parts.includes('.git')) return null;
    try {
      const rootReal = await realpath(root);
      let current = rootReal;
      for (const part of parts) {
        current = join(current, part);
        if ((await lstat(current)).isSymbolicLink()) return null;
      }
      // Belt and braces: the lstat walk and the realpath must agree, and the
      // resolved file must not sit under the clone's `.git`.
      const fileReal = await realpath(current);
      if (fileReal !== current) return null;
      const gitDir = join(rootReal, '.git');
      if (fileReal === gitDir || fileReal.startsWith(gitDir + sep)) return null;
      if (!fileReal.startsWith(rootReal + sep)) return null;
      // O_NOFOLLOW closes the lstat→open window for the final component.
      const handle = await open(fileReal, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await handle.stat();
        if (!info.isFile()) return null;
        const length = maxBytes === undefined ? info.size : Math.min(info.size, Math.max(0, maxBytes));
        const buffer = Buffer.alloc(length);
        let filled = 0;
        while (filled < length) {
          const { bytesRead } = await handle.read(buffer, filled, length - filled, filled);
          if (bytesRead === 0) break;
          filled += bytesRead;
        }
        return buffer.subarray(0, filled).toString('utf8');
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  private async walk(root: string, rel: string, glob: string, out: DocEntry[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(join(root, rel), { withFileTypes: true });
    } catch {
      return; // unreadable directory — keep listing what we can
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // never follow symlinks
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        await this.walk(root, childRel, glob, out);
      } else if (entry.isFile() && matchesGlob(childRel, glob)) {
        try {
          out.push({ path: childRel, size: (await stat(join(root, childRel))).size });
        } catch {
          // vanished between readdir and stat — skip
        }
      }
    }
  }
}
