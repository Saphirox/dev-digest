/**
 * Intent Layer limits — cap what the classifier request can grow to. Every
 * value here bounds the request to file names / hunk headers / short text, so
 * even a very large PR stays a cheap, bounded call. See `helpers.ts`.
 */

/** Cap on distinct changed files listed in `## Changed files`. */
export const MAX_FILES = 30;

/** Cap on `@@ … @@` hunk headers attributed to a single file. */
export const MAX_HUNKS_PER_FILE = 8;

/** Cap on the PR title+body text sent as evidence. */
export const MAX_BODY_CHARS = 4000;

/** Cap on a single linked document's content sent as evidence. */
export const MAX_DOC_CHARS = 4000;

/** Cap on how many doc links from the PR body are followed. */
export const MAX_DOC_LINKS = 3;
