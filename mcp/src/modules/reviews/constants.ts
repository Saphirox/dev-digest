export const RATIONALE_MAX = 800;
export const SUGGESTION_MAX = 600;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

/**
 * `detail:"full"` adds `end_line`/`category`/`rationale`(≤800)/`suggestion`(≤600)
 * per finding — at `MAX_LIMIT` (50) that risks blowing the plan's ≤40,000-char
 * budget (Token budget). Computed, not guessed: an ALL-MAX fixture (every
 * finding at max-length file/title/category/agent plus the 800/600 rationale/
 * suggestion caps, wrapped in the real `get_findings` tool response shape —
 * `structuredContent` + rendered text lines) fits at 18 findings (38,514
 * chars) and overflows at 19 (40,632 chars) — see
 * `test/reviews-helpers.test.ts`'s "Token budget" describe block, which
 * recomputes and asserts this exact boundary. Keep the two in sync if either
 * changes.
 */
export const FULL_LIMIT_MAX = 18;

export const DEFAULT_POLL_MS = 3_000;
export const FINDINGS_LIMIT = 20;
