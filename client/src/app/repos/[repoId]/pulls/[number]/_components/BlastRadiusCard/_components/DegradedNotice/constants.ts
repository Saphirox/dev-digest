import type { BlastDegradedReason } from "@devdigest/shared";

/**
 * `t(\`degraded.reason.${DEGRADED_REASON_KEY[reason]}\`)` — an identity
 * `Record<BlastDegradedReason, …>` so `tsc` fails if the shared contract
 * grows a 6th reason before this component (and `blast.json`) learn about
 * it, same pattern as `RiskAreas`' `RISK_ICON`.
 */
export const DEGRADED_REASON_KEY: Record<BlastDegradedReason, string> = {
  flag_off: "flag_off",
  index_failed: "index_failed",
  index_partial: "index_partial",
  repo_too_large: "repo_too_large",
  no_data: "no_data",
};

/** Resync can only help when the index itself is missing/stale/broken — not
 *  when the feature flag is off, and not when the repo is simply too large
 *  to ever fully index (resync would just fail the same way again). */
export const RESYNC_HELPS: Record<BlastDegradedReason, boolean> = {
  flag_off: false,
  index_failed: true,
  index_partial: true,
  repo_too_large: false,
  no_data: true,
};
