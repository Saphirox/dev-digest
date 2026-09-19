/**
 * Max PRs whose zeroed diff stats get backfilled per list request. Each
 * backfill is a GitHub detail fetch; the periodic refetch chips away at the rest.
 */
export const BACKFILL_LIMIT = 10;
