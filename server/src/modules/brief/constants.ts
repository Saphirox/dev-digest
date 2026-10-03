/**
 * brief module constants — the PR Brief's size limits. The model gets facts
 * only (no diff hunk bodies), so these bound a single `risk_brief` call.
 */

/** Total characters of facts sent to the model per generation (NFR-5, D-13). */
export const MAX_FACT_CHARS = 40_000;
/** Risks stored per brief, kept in the model's order after validation (NFR-6). */
export const MAX_RISKS = 8;
/** Review-focus items stored per brief, kept in the model's order (NFR-6). */
export const MAX_FOCUS = 10;
/** Per-file "what this does" lines stored per brief, model order. */
export const MAX_FILE_SUMMARIES = 40;
/** Cap on one file summary's characters. */
export const MAX_FILE_SUMMARY_CHARS = 240;

/** Cap on the PR description text sent as evidence. */
export const MAX_BODY_CHARS = 4000;
/** Cap on the linked issue's body sent as evidence. */
export const MAX_ISSUE_CHARS = 4000;
/** Cap on the stored intent text (summary + scope lists) sent as evidence. */
export const MAX_INTENT_CHARS = 3000;
/** Cap on the blast-radius names text (symbols, callers) sent as evidence. */
export const MAX_BLAST_CHARS = 8000;
/** Cap on changed-file lines listed (the rest is counted, not listed). */
export const MAX_FILES = 300;

/**
 * Characters the prompt frame adds around the facts (system-independent
 * headings, `<untrusted>` wrappers). Reserved out of `MAX_FACT_CHARS` so the
 * assembled user message itself stays within the budget.
 */
export const FRAME_RESERVE_CHARS = 2_000;
/** Per spec-document wrapper cost on top of the label, see `specOverhead`. */
export const SPEC_WRAPPER_CHARS = 80;

/** Appended where text was cut to fit a cap or the total budget. */
export const TRUNCATION_MARKER = '… [truncated]';

/** Cap on a provider error message echoed in `ExternalServiceError`. */
export const MAX_ERROR_CHARS = 300;
