/**
 * blast module constants — "Prior PRs touching these files" caps. Kept
 * small: the worst case is `PRIOR_PR_MAX_FILES` commit-history calls plus
 * (that many × `PRIOR_PR_COMMITS_PER_FILE`) PR-lookup calls per uncached
 * expand (see the plan's "GitHub budget" risk).
 */

/** Top-N changed files (by additions+deletions) sampled for history. */
export const PRIOR_PR_MAX_FILES = 10;
/** Commits looked up per sampled file. */
export const PRIOR_PR_COMMITS_PER_FILE = 3;
/** Prior PRs returned, after sorting by file overlap then recency. */
export const PRIOR_PR_MAX_RESULTS = 5;
/** Concurrency cap for the per-commit `listPullsForCommit` fan-out. */
export const PRIOR_PR_CONCURRENCY = 4;
/** Bounded in-memory cache size (keyed by `prId:head_sha`). */
export const PRIOR_PR_CACHE_MAX_ENTRIES = 200;
