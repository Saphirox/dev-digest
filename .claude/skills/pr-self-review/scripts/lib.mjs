// Shared helpers for the pr-self-review scripts: git plumbing, the diff
// fingerprint (diffHash), glob matching and the run/cache directory layout.
// Plain Node ≥22, no dependencies — the skill must run in any package state.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd ?? repoRoot(),
    encoding: opts.encoding ?? 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'pipe'],
  });
}

let root;
export function repoRoot() {
  root ??= execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  return root;
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Merge-base of HEAD with the PR target. `origin/main` first so a stale local main can't widen the diff. */
export function resolveBase(explicit) {
  const candidates = explicit ? [explicit] : ['origin/main', 'main'];
  for (const ref of candidates) {
    try {
      const base = git(['merge-base', ref, 'HEAD'], { quiet: true }).trim();
      if (base) return { ref, sha: base };
    } catch {}
  }
  throw new Error(`cannot resolve a merge-base with ${candidates.join(' / ')}`);
}

export function untrackedFiles() {
  return git(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .sort();
}

/**
 * Fingerprint of everything a PR from this worktree would contain: the
 * working tree vs the merge-base (committed + staged + unstaged) plus the
 * untracked files. Committing reviewed changes does NOT change it, so a PASS
 * given before `git commit` still holds at `git push` / `gh pr create`.
 */
export function diffHash(base) {
  const h = createHash('sha256');
  h.update(`base:${base.sha}\n`);
  h.update(git(['diff', '--binary', '--no-color', '--no-ext-diff', base.sha], { encoding: 'buffer' }));
  for (const path of untrackedFiles()) {
    h.update(`\0untracked:${path}\0`);
    try {
      h.update(readFileSync(join(repoRoot(), path)));
    } catch {}
  }
  return h.digest('hex').slice(0, 16);
}

export const stateDir = () => join(repoRoot(), '.devdigest', 'self-review');
export const runDir = (hash) => join(stateDir(), 'runs', hash);
export const cacheDir = () => join(stateDir(), 'cache');
export const overridesPath = () => join(stateDir(), 'overrides.json');

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error(`cannot read JSON: ${path}`);
  }
}

/** Glob → RegExp: `**` crosses directories, `*` and `?` don't, `{a,b}` alternates. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path));

/** Content hash of a whole directory — a skill edit must invalidate its cached reviews. */
export function hashDir(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(`${p.slice(dir.length)}\0`).update(readFileSync(p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return h.digest('hex');
}

/** Stable identity of a finding across runs: survives line shifts, changes when the flagged code changes. */
export function fingerprint(f) {
  const evidence = String(f.evidence ?? '').replace(/\s+/g, ' ').trim();
  return sha256(`${f.skill}|${f.rule}|${f.file}|${evidence}`).slice(0, 12);
}
