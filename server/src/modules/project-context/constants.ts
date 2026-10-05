/** Per-document token cap for injected project context (NFR-5). */
export const MAX_DOC_TOKENS = 8000;

/** Total token cap for one run's project context (NFR-6). */
export const MAX_RUN_TOKENS = 24000;

/**
 * Largest file the list/preview routes will read and tokenize (NFR-1 hardening):
 * bigger files are listed with `tokens: null` and previewed as a truncated prefix.
 */
export const MAX_DOC_BYTES = 1_000_000;

/**
 * Bytes read per document for a run. A token is rarely under 8 bytes' worth of
 * text at the per-doc token cap, so this bounds the tokenize cost while still
 * letting an oversized doc reach the truncation marker.
 */
export const MAX_DOC_RUN_BYTES = MAX_DOC_TOKENS * 8;

/** Document folders a file's `type` is derived from (EC-6). */
export const DOC_TYPE_FOLDERS = ['specs', 'docs', 'insights'] as const;

/** `type` for a doc under a custom glob that matches none of the folders above. */
export const FALLBACK_DOC_TYPE = 'docs' as const;
