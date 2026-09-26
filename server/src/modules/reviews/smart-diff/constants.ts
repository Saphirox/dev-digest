/**
 * Smart Diff classifier rules — deterministic, path-only derivation from
 * `pr_files.path` (see `docs/plans/0009-smart-diff-spec-completion.md`).
 * Every regex matches a whole PATH SEGMENT or file extension (bounded by
 * `/`, `.`, or the string edges), same anchoring convention as
 * `risks/constants.ts` — never a bare substring, which is what over-matched
 * "for" in the Intent Layer's scope filter (`server/INSIGHTS.md`,
 * 2026-09-20).
 *
 * Two ordered passes, both walked in `CLASSIFY_PRIORITY` order
 * (`boilerplate → tests → wiring → docs`): all `SPEC_RULES` first, then all
 * `EXTRA_RULES`. First match wins; otherwise `core`. An extra therefore only
 * ever fires on a path the spec alone would call `core`. `SPEC_RULES` and
 * `EXTRA_RULES` are `Record<NonCoreRole, …>` (not flat arrays), so the
 * priority order is CODE — `classify.ts` walks `CLASSIFY_PRIORITY`, never an
 * array-literal's incidental order — not a comment a future edit can
 * silently invalidate.
 *
 * Glob semantics (no glob dependency — lock files are do-not-touch and
 * neither `package.json` installs picomatch/minimatch, so this is
 * implemented with hand-written regexes): a pattern with no slash matches
 * the BASENAME at any depth (`pnpm-lock.yaml`, `*.lock`, `README*`); a
 * pattern with a slash is anchored at the repo root (`dist`, `docs`,
 * `.github`, each followed by a doubled-star segment); a LEADING doubled-star
 * segment (as in a doubled-star before a slash before `__snapshots__`)
 * matches zero or more leading path segments, so it matches at any depth.
 */
import type { SmartDiffRole } from '@devdigest/shared';

/** Every role but the `core` fallback — the classifier only ever matches
 *  INTO one of these; `core` is what's left when none do. */
export type NonCoreRole = Exclude<SmartDiffRole, 'core'>;

/** Display order for the five Smart Diff groups — every group renders,
 *  empty or not (Decision 10). */
export const ROLE_ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const satisfies readonly SmartDiffRole[];
// Compile-time-only exhaustiveness check: a role added to (or removed from)
// the contract without updating this list fails `tsc`, not just a stale
// runtime default (`typescript-expert`: `Exclude<…> extends never`, not
// `satisfies` alone, which only checks the listed members are valid, not
// that every member is listed).
type _RoleOrderExhaustive = Exclude<SmartDiffRole, (typeof ROLE_ORDER)[number]> extends never ? true : never;
const _roleOrderIsExhaustive: _RoleOrderExhaustive = true;
void _roleOrderIsExhaustive;

/** Classifier match priority — every role but the `core` fallback, checked
 *  in this order within each pass (Decision 2). `classify.ts` walks this
 *  array to pick which of `SPEC_RULES`/`EXTRA_RULES`'s role buckets to test
 *  next, so the priority is enforced by the loop, not by array-literal
 *  ordering inside those records. */
export const CLASSIFY_PRIORITY = ['boilerplate', 'tests', 'wiring', 'docs'] as const satisfies readonly NonCoreRole[];
type _ClassifyPriorityExhaustive = Exclude<SmartDiffRole, 'core' | (typeof CLASSIFY_PRIORITY)[number]> extends never
  ? true
  : never;
const _classifyPriorityIsExhaustive: _ClassifyPriorityExhaustive = true;
void _classifyPriorityIsExhaustive;

/** A pure path predicate. `base` is the precomputed `posix.basename(path)`,
 *  passed in so basename-only rules don't recompute it. */
export type ClassifyTest = (path: string, base: string) => boolean;

/** Every role's rule list, keyed by role — a `Record`, not a flat array, so
 *  TS itself rejects a missing role (no `satisfies` escape hatch needed: a
 *  `Record<NonCoreRole, …>` REQUIRES every key). */
export type RoleRules = Record<NonCoreRole, readonly ClassifyTest[]>;

const re = (pattern: RegExp): ClassifyTest => (path) => pattern.test(path);
const baseRe = (pattern: RegExp): ClassifyTest => (_path, base) => pattern.test(base);
const baseSet = (set: ReadonlySet<string>): ClassifyTest => (_path, base) => set.has(base);

// ---------------------------------------------------------------------------
// SPEC_RULES — the homework spec's own glob list, one regex per glob,
// grouped by role (the role IS the priority bucket — see CLASSIFY_PRIORITY).
// ---------------------------------------------------------------------------

export const SPEC_RULES: RoleRules = {
  boilerplate: [
    baseRe(/\.lock$/), // *.lock
    baseRe(/^pnpm-lock\.yaml$/),
    baseRe(/^package-lock\.json$/),
    baseRe(/^yarn\.lock$/),
    re(/^dist\//), // dist/**
    re(/^build\//), // build/**
    re(/(?:^|\/)__snapshots__\//), // **/__snapshots__/**
    baseRe(/\.snap$/), // *.snap
    baseRe(/\.generated\.[^/]+$/), // *.generated.*
    baseRe(/\.min\.js$/), // *.min.js
  ],
  tests: [
    baseRe(/\.test\.tsx?$/), // *.test.ts(x)
    baseRe(/\.it\.test\.ts$/), // *.it.test.ts
    baseRe(/\.spec\.ts$/), // *.spec.ts
    re(/(?:^|\/)test\//), // **/test/**
    re(/(?:^|\/)tests\//), // **/tests/**
    re(/(?:^|\/)__tests__\//), // **/__tests__/**
    re(/^e2e\//), // e2e/**
  ],
  wiring: [
    baseRe(/^index\.ts$/),
    baseRe(/^index\.js$/),
    baseRe(/\.config\.[^/]+$/), // *.config.*
    baseRe(/^tsconfig[^/]*\.json$/), // tsconfig*.json
    baseRe(/^\.eslintrc[^/]*$/), // .eslintrc*
    baseRe(/^\.env[^/]*$/), // .env*
    baseRe(/^docker-compose[^/]*\.yml$/), // docker-compose*.yml
    re(/^\.github\//), // .github/**
    re(/^\.claude\//), // .claude/**
  ],
  docs: [
    baseRe(/\.md$/), // **/*.md
    re(/^docs\//), // docs/**
    baseRe(/^README[^/]*$/), // README*
    baseRe(/^CHANGELOG[^/]*$/), // CHANGELOG*
    baseRe(/^LICENSE$/), // LICENSE
  ],
};

// ---------------------------------------------------------------------------
// EXTRA_RULES — the pre-existing project-specific patterns, kept only where
// they don't overlap a SPEC glob above (Decision 2: "an extra only fires on
// a path the spec alone would call core").
// ---------------------------------------------------------------------------

/** Lock basenames with no `.lock` extension, so not already caught by the
 *  SPEC `*.lock` glob. */
const EXTRA_LOCK_BASENAMES: ReadonlySet<string> = new Set(['npm-shrinkwrap.json', 'bun.lockb', 'go.sum']);

/** A path segment that is generated/vendored output — mechanical churn no
 *  one hand-writes. Segment-anchored like the SPEC rules above. */
export const GENERATED_PATH_RE =
  /(?:^|\/)(?:dist|build|out|coverage|node_modules|\.next|__snapshots__|generated|vendor|fixtures)(?:\/|$)/;

/** A file EXTENSION that is generated/binary — never hand-authored core
 *  logic. `.snap`/`.lock`/`.min.js` are already SPEC globs; this is what's
 *  left over. */
export const GENERATED_FILE_RE = /\.(?:min\.css|map|svg|png|jpe?g|gif|ico|woff2?|pdf)$/;

/** A test file by name, any test/spec extension combo — broader than the
 *  SPEC `*.test.ts(x)`/`*.spec.ts` globs (catches `*.spec.tsx`, `*.test.jsx`,
 *  …). */
export const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** `__mocks__`/`e2e` at any depth — the SPEC `e2e/**` glob is root-anchored,
 *  so a nested e2e directory still needs this. */
const TEST_PATH_EXTRA_RE = /(?:^|\/)(?:__mocks__|e2e)(?:\/|$)/;

/** Basenames that are wiring regardless of directory, not already a SPEC
 *  basename (`index.ts`/`.js`, `tsconfig*.json`, `docker-compose*.yml`, …). */
const EXTRA_WIRING_BASENAMES: ReadonlySet<string> = new Set(['index.tsx', 'package.json', 'Dockerfile']);

/** A path segment that wires the app together rather than carrying new
 *  behaviour: config, routing declarations, migrations, CI scripts, i18n,
 *  types, schema. `docs?` and `.github` moved out — `docs?` to
 *  `DOCS_PATH_EXTRA_RE` below, `.github` to the SPEC `.github/**` glob —
 *  so neither pre-empts the SPEC docs/CI rules (Decision 2). */
export const WIRING_PATH_RE =
  /(?:^|\/)(?:config|configs|routes?|middleware|migrations|scripts|messages|types?|constants|schema|schemas)(?:\/|\.[^/]+$|$)/;

/** A `doc`/`docs` path segment at any depth — the SPEC `docs/**` glob is
 *  root-anchored. */
const DOCS_PATH_EXTRA_RE = /(?:^|\/)docs?(?:\/|$)/;

/** A file EXTENSION that is prose, not already a SPEC extension (`.md`). */
const DOCS_FILE_EXTRA_RE = /\.(?:mdx|txt)$/;

export const EXTRA_RULES: RoleRules = {
  boilerplate: [baseSet(EXTRA_LOCK_BASENAMES), re(GENERATED_PATH_RE), baseRe(GENERATED_FILE_RE)],
  tests: [baseRe(TEST_FILE_RE), re(TEST_PATH_EXTRA_RE)],
  wiring: [baseSet(EXTRA_WIRING_BASENAMES), re(WIRING_PATH_RE)],
  docs: [re(DOCS_PATH_EXTRA_RE), baseRe(DOCS_FILE_EXTRA_RE)],
};
