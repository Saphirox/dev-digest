/**
 * Path + size classifier — pure, no I/O (see `docs/plans/0004-smart-diff.md`
 * step 2). Only `constants.js`, `node:path`'s `posix.basename`, and the
 * `SmartDiffRole` type are imported.
 */
import { posix } from 'node:path';
import type { SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_MIN_CHANGED_LINES,
  GENERATED_FILE_RE,
  GENERATED_PATH_RE,
  TEST_FILE_RE,
  TEST_PATH_RE,
  LOCK_BASENAMES,
  WIRING_BASENAMES,
  WIRING_FILE_RE,
  WIRING_MAX_CHANGED_LINES,
  WIRING_PATH_RE,
} from './constants.js';

/**
 * Classify one changed file into a review-risk group. Evaluation order is
 * fixed and MUST stay in this order:
 *
 * 1. A lock-file basename is ALWAYS `boilerplate`, before any size check —
 *    that is the acceptance criterion ("lock files land in boilerplate
 *    regardless of size"); checking size first would let a huge lock file
 *    correctly land in boilerplate but a TINY one (a one-line version bump)
 *    fall through to the wiring/core rules below.
 * 2. A generated path or file extension is boilerplate next, before size —
 *    same reasoning: a small generated-file diff is still not worth review.
 * 3. Past that, a very large diff is mechanical churn regardless of path.
 * 4. A wiring path/basename, not yet caught above.
 * 5. A very small diff, not yet caught above, is wiring rather than core.
 * 6. Everything else is core — the substance of the change.
 */
export function classifyFile(path: string, additions: number, deletions: number): SmartDiffRole {
  const base = posix.basename(path);
  const changed = additions + deletions;

  if (LOCK_BASENAMES.has(base)) return 'boilerplate';
  if (GENERATED_PATH_RE.test(path) || GENERATED_FILE_RE.test(path)) return 'boilerplate';
  // Tests, by name or location — size-independent like the rules above, so a
  // 3-line test tweak does not fall through to `wiring` via the size rule.
  // Docs that merely LIVE in a test directory (`e2e/CLAUDE.md`) are prose, not
  // tests, so the location rule skips them and they stay `wiring` below.
  if (TEST_FILE_RE.test(path) || (TEST_PATH_RE.test(path) && !WIRING_FILE_RE.test(path)))
    return 'boilerplate';
  if (changed >= BOILERPLATE_MIN_CHANGED_LINES) return 'boilerplate';
  if (WIRING_BASENAMES.has(base) || WIRING_PATH_RE.test(path) || WIRING_FILE_RE.test(path))
    return 'wiring';
  if (changed <= WIRING_MAX_CHANGED_LINES) return 'wiring';
  return 'core';
}
