/**
 * Risk Areas detector limits + keyword tables — deterministic derivation from
 * the diff, no model call (see the risk-source ADR in
 * `docs/plans/0003-intent-card-risk-areas.md`). Every regex matches a whole
 * PATH SEGMENT (bounded by `/`, `.`, or the string edges), never a substring,
 * to avoid the Intent Layer scope-filter's over-matching bug
 * (`server/INSIGHTS.md`, 2026-09-20: a bare substring match on "for" dropped
 * unrelated findings).
 */

/** Path segment matching auth/session/permission-adjacent code. */
export const AUTH_PATH_RE =
  /(^|\/)(auth|authn|authz|middleware|session|token|permission|rbac|login|oauth|jwt)(\/|\.[^/]+$|$)/i;

/** Path segment matching request-handling code (where a per-request extra
 *  round-trip is expensive, unlike a one-off script or seed). */
export const REQUEST_PATH_RE = /(^|\/)(routes?|middleware|handlers?|controllers?|api)(\/|\.[^/]+$|$)/i;

/** Manifest basenames the `new_dependency` detector scans. */
export const MANIFEST_BASENAMES = ['package.json'];

/** One `"key": "value"` JSON line — the shape of a package.json dependency
 *  entry. Group 1 is the key, group 2 the value (dependency version range). */
export const DEP_LINE_RE = /^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/;

/**
 * Dependency-range shape a package.json value must have to be treated as a
 * dependency: a semver range (starting `^ ~ > < = digit`) or a package
 * specifier (`npm: | workspace: | file: | link: | git+ | github:`).
 * Anchored at BOTH ends — a value can't merely "start" with a valid marker
 * and then carry arbitrary trailing text (a shell command, a secret) into
 * the explanation. This is the PRIMARY defence against `new_dependency`
 * fabricating a row from an npm script or leaking raw diff text; see
 * `docs/plans/0003-intent-card-risk-areas.md` Finding 1.
 */
export const DEP_VALUE_RE =
  /^(?:[\^~]?\d[\w.*x-]*(?:\s*\|\|\s*[\^~]?\d[\w.*x-]*)*|[<>]=?\d[\w.-]*|=\d[\w.-]*|\*|latest|(?:npm|workspace|file|link|github):[\w.*^~/@:#-]*|git\+[\w./:#@-]+)$/i;

/** The only JSON blocks `new_dependency` may fire inside, when the hunk's
 *  context lines make the enclosing block visible (see `enclosingBlockKey`
 *  in `detectors.ts`). Not consulted when the block can't be determined from
 *  the visible context — the value-shape rule (`DEP_VALUE_RE`) is the
 *  fallback, never a guess. */
export const DEP_BLOCK_KEYS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]);

/** Top-level manifest / script keys that match `DEP_LINE_RE` AND
 *  `DEP_VALUE_RE` (e.g. `"version": "1.0.0"`) but are not a dependency entry.
 *  A SECONDARY guard only — `DEP_VALUE_RE` + the block check above are the
 *  primary defence; this list exists because a key like `version` sits at
 *  the package.json root, where the enclosing-block search usually can't see
 *  far enough to rule it out from context alone. */
export const NON_DEP_KEYS = new Set([
  'name',
  'version',
  'description',
  'main',
  'module',
  'types',
  'typings',
  'private',
  'license',
  'author',
  'homepage',
  'repository',
  'bugs',
  'keywords',
  'scripts',
  'engines',
  'packageManager',
  'type',
  'sideEffects',
  'exports',
  'files',
  'publishConfig',
  'workspaces',
  'node',
  'build',
  'test',
  'start',
  'dev',
  'lint',
  'format',
  'typecheck',
  'prepare',
  'postinstall',
  'preinstall',
]);

/** Patterns that add an extra network round-trip per call. */
export const PERF_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Redis', re: /\b(new Redis\(|createClient\(|ioredis)/ },
  { label: 'HTTP', re: /\b(fetch\(|axios\.|got\(|http\.request\()/ },
];

/** Cap on how many risks `deriveRisks` returns (post-grounding). */
export const MAX_RISKS = 8;

/** Cap on refs attached to a single risk. */
export const MAX_REFS_PER_RISK = 5;

/** Cap on how many `+` lines `addedLines` re-scans from the raw diff. */
export const MAX_SCAN_LINES = 20000;
