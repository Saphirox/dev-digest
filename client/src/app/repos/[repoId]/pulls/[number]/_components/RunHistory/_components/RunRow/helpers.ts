import type { IconName } from "@devdigest/ui";
import type { RunSummary } from "@devdigest/shared";

/** i18n key under `runStatus` + colour tokens + icon for a run's badge. */
export type Outcome = { key: string; color: string; bg: string; icon: IconName };

/**
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". Outcome
 * is derived from the denormalized blocker/finding counts on the run row, so it
 * matches the CI gate (deterministic) rather than the model's verdict.
 */
export function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

/** Combined in+out tokens — null, not 0, when neither side was recorded: a run
 *  whose token counts are unknown must not claim "0 tok" just because its cost
 *  is known. */
export function totalTokens(run: Pick<RunSummary, "tokens_in" | "tokens_out">): number | null {
  if (run.tokens_in == null && run.tokens_out == null) return null;
  return (run.tokens_in ?? 0) + (run.tokens_out ?? 0);
}
