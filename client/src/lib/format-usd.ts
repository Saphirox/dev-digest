/**
 * USD formatting for run cost.
 *
 * Review runs are cheap — a single agent on a flash model lands around
 * $0.0013 — so a plain 2-decimal currency format would round most runs to
 * "$0.00" and make the whole feature read as broken. We therefore keep at
 * least 3 significant digits, growing the decimals as the number shrinks.
 *
 * null/undefined is NOT zero: an unknown cost (a failed run, a model with no
 * published price, a run recorded before cost was tracked) renders "—", so a
 * missing number is never mistaken for a free one.
 */

/** Widest fraction we will ever print — past this the digits are noise. */
const MAX_DECIMALS = 8;
/** Significant digits to preserve for sub-dollar amounts. */
const SIGNIFICANT_DIGITS = 3;

export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "$0.00";
  // log10 gives the position of the first significant digit; for 0.0013 that
  // is -3, so we need 3 - (-3) - 1 = 5 decimals to show "0.00135".
  const magnitude = Math.floor(Math.log10(Math.abs(v)));
  const decimals = Math.min(Math.max(2, SIGNIFICANT_DIGITS - magnitude - 1), MAX_DECIMALS);
  return `$${v.toFixed(decimals)}`;
}
