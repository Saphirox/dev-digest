/**
 * Path-only classifier — pure, no I/O (see
 * `docs/plans/0009-smart-diff-spec-completion.md` step 3). Only
 * `constants.js`, `node:path`'s `posix.basename`, and the `SmartDiffRole`
 * type are imported.
 */
import { posix } from 'node:path';
import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_PRIORITY, SPEC_RULES, EXTRA_RULES } from './constants.js';

/**
 * Classify one changed file into a review-risk group, from its path alone.
 * Two ordered passes, both walking `CLASSIFY_PRIORITY` (`boilerplate →
 * tests → wiring → docs`) — the loop, not an array literal's incidental
 * order, is what enforces the priority: `SPEC_RULES`/`EXTRA_RULES` are
 * `Record<NonCoreRole, …>`, so there is no "list order" to get wrong. All of
 * `SPEC_RULES` first, then all of `EXTRA_RULES`. First match wins; otherwise
 * `core`.
 */
export function classifyFile(path: string): SmartDiffRole {
  const base = posix.basename(path);
  for (const role of CLASSIFY_PRIORITY) {
    if (SPEC_RULES[role].some((test) => test(path, base))) return role;
  }
  for (const role of CLASSIFY_PRIORITY) {
    if (EXTRA_RULES[role].some((test) => test(path, base))) return role;
  }
  return 'core';
}
