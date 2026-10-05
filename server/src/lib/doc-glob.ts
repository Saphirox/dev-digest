/**
 * Project-context document glob helpers. Shared by the fs adapter
 * (`adapters/docs/fs.ts`, which walks the clone) and the agents/skills services
 * (which validate stored `context_paths`), so it sits outside `src/modules/`
 * and `src/adapters/` — either side may import it without tripping `arch:check`.
 *
 * No I/O. Supported glob syntax is deliberately tiny: a doubled star spans zero
 * or more path segments, a single star stays inside one segment, and `{a,b}`
 * lists alternatives (no nesting). Anything else is matched literally.
 */
import { posix } from 'node:path';
import { InvalidContextPathError } from '../platform/errors.js';

/** Default search glob when `CONTEXT_GLOB` is unset. */
export const DEFAULT_CONTEXT_GLOB = '**/{specs,docs,insights}/**/*.md';

const REGEX_SPECIALS = /[.+^$()|[\]\\?]/g;

function escapeLiteral(text: string): string {
  return text.replace(REGEX_SPECIALS, '\\$&');
}

/** Translate one brace-free glob fragment into a regex source. */
function fragmentToRegex(fragment: string): string {
  let out = '';
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i]!;
    if (ch === '*') {
      if (fragment[i + 1] === '*') {
        // doubled star: with a trailing slash it is "zero or more whole segments"
        if (fragment[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else {
      out += escapeLiteral(ch);
    }
  }
  return out;
}

/** Compile a glob into an anchored RegExp over posix-relative paths. */
export function compileGlob(glob: string): RegExp {
  let source = '';
  let rest = glob;
  while (rest.length > 0) {
    const open = rest.indexOf('{');
    const close = open === -1 ? -1 : rest.indexOf('}', open);
    if (open === -1 || close === -1) {
      source += fragmentToRegex(rest);
      break;
    }
    source += fragmentToRegex(rest.slice(0, open));
    const alternatives = rest
      .slice(open + 1, close)
      .split(',')
      .map((alt) => fragmentToRegex(alt));
    source += `(?:${alternatives.join('|')})`;
    rest = rest.slice(close + 1);
  }
  return new RegExp(`^${source}$`);
}

/** True when the posix-relative `path` matches `glob`. */
export function matchesGlob(path: string, glob: string): boolean {
  return compileGlob(glob).test(path);
}

/**
 * A repo-relative markdown path that is safe to join onto a clone root:
 * already normalised (so `..`/`.`/`//` segments are rejected outright), relative,
 * free of backslashes and NUL, and ending in `.md`. Allowlist, not denylist.
 */
export function isSafeRelPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return false;
  if (path.includes('\0') || path.includes('\\')) return false;
  if (path.startsWith('/')) return false;
  if (posix.normalize(path) !== path) return false;
  if (path.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return false;
  return path.endsWith('.md');
}

/** The subset of `paths` that is unsafe or does not match `glob` (EC-3). */
export function invalidContextPaths(paths: readonly string[], glob: string): string[] {
  const re = compileGlob(glob);
  return paths.filter((p) => !isSafeRelPath(p) || !re.test(p));
}

/**
 * Throw `InvalidContextPathError` (400) when any of `paths` is unsafe or outside
 * `glob`. Call BEFORE any write so a bad path stores nothing (EC-3).
 */
export function assertValidContextPaths(paths: readonly string[], glob: string): void {
  const invalid = invalidContextPaths(paths, glob);
  if (invalid.length > 0) throw new InvalidContextPathError(invalid);
}
