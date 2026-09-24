/**
 * Smart Diff classifier + summariser limits — deterministic derivation from
 * `pr_files` (path/additions/deletions/patch), no model call (see
 * `docs/plans/0004-smart-diff.md`). Every path regex matches a whole PATH
 * SEGMENT (bounded by `/`, `.`, or the string edges), same anchoring
 * convention as `risks/constants.ts` — never a bare substring, which is what
 * over-matched "for" in the Intent Layer's scope filter (`server/INSIGHTS.md`,
 * 2026-09-20).
 */

/** Lock-file basenames — always `boilerplate`, whatever their size (the
 *  acceptance criterion). Exact basename match, not a path segment regex. */
export const LOCK_BASENAMES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'bun.lockb',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'go.sum',
]);

/** A path segment that is generated/vendored output — mechanical churn no one
 *  hand-writes. */
export const GENERATED_PATH_RE =
  /(^|\/)(dist|build|out|coverage|node_modules|\.next|__snapshots__|generated|vendor|fixtures)(\/|$)/;

/** A file EXTENSION that is generated/binary/minified — never hand-authored
 *  core logic. */
export const GENERATED_FILE_RE = /\.(min\.js|min\.css|snap|map|lock|svg|png|jpg|jpeg|gif|ico|woff2?|pdf)$/;

/** A path segment that wires the app together rather than carrying new
 *  behaviour: config, routing declarations, migrations, CI, docs, i18n,
 *  types, schema. */
export const WIRING_PATH_RE =
  /(^|\/)(config|configs|routes?|middleware|migrations|scripts|\.github|docs?|messages|types?|constants|schema|schemas)(\/|\.[^/]+$|$)/;

/** A file EXTENSION that is prose, not logic. Documentation is hand-written
 *  (so not `boilerplate`) but carries no behaviour a reviewer reads for
 *  correctness, so it groups with the wiring a reviewer skims. Without this,
 *  a root-level `CLAUDE.md`/`INSIGHTS.md` matches no path segment and falls
 *  through to `core`, crowding out the actual source changes. */
export const WIRING_FILE_RE = /\.(md|mdx|txt)$/;

/** Basenames that are wiring regardless of directory. */
export const WIRING_BASENAMES: ReadonlySet<string> = new Set([
  'index.ts',
  'index.tsx',
  'package.json',
  'tsconfig.json',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
  'README.md',
]);

/** A test file by NAME: `*.test.ts`, `*.spec.tsx`, `*.it.test.ts`, … Tests are
 *  hand-written, not generated, but a reviewer reads them AFTER the logic they
 *  cover, so they group with boilerplate (collapsed by default) rather than
 *  crowding the Core section. Anchored at the end like `GENERATED_FILE_RE`. */
export const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** A test file by LOCATION: any path segment that is a test directory
 *  (`test/`, `tests/`, `__tests__/`, `__mocks__/`, `e2e/`). Path-segment
 *  anchored like `GENERATED_PATH_RE`, so `latest/` or `contest.ts` never match. */
export const TEST_PATH_RE = /(^|\/)(?:__tests__|__mocks__|tests?|e2e)(\/|$)/;

/** Above this many changed lines (additions+deletions), even a path that
 *  matches no pattern is treated as mechanical churn — a hand-written change
 *  this large in one file is the exception, not the rule. */
export const BOILERPLATE_MIN_CHANGED_LINES = 800;

/** At or below this many changed lines, a file is small enough to be wiring
 *  rather than substance, even outside a wiring path. */
export const WIRING_MAX_CHANGED_LINES = 6;

/** `too_big` threshold for `split_suggestion` — total changed lines across
 *  the whole PR. */
export const SPLIT_LINES = 400;

/** Cap on how many lines one finding's `start_line..end_line` range expands
 *  to, so one wide finding can't blow up a file's `finding_lines` array. */
export const MAX_FINDING_RANGE_LINES = 200;
