/**
 * Duration / cost estimates and totals for multi-agent runs. Pure, no React.
 *
 * null is NOT zero (see format-usd.ts): an unknown duration or cost renders
 * "—" and is skipped when aggregating, so a missing number never reads as free
 * or instant.
 */
import type { AgentRunEstimate, RunSummary } from "@devdigest/shared";
import { formatUsd } from "./format-usd";

/** "8.2s", or "—" when the duration is unknown. */
export function formatSeconds(ms: number | null | undefined, digits = 1): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(digits)}s`;
}

/** An agent card's estimate: "8.2s · $0.06"; each unknown half is "—". */
export function formatEstimate(est: Pick<AgentRunEstimate, "avg_duration_ms" | "avg_cost_usd"> | undefined): string {
  return `${formatSeconds(est?.avg_duration_ms)} · ${formatUsd(est?.avg_cost_usd)}`;
}

function known(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => v != null && Number.isFinite(v));
}

/** Largest of the known values, or null when none is known. */
function maxKnown(values: readonly (number | null | undefined)[]): number | null {
  const k = known(values);
  return k.length > 0 ? Math.max(...k) : null;
}

/** Sum of the known values, or null when none is known. */
export function sumKnown(values: readonly (number | null | undefined)[]): number | null {
  const k = known(values);
  return k.length > 0 ? k.reduce((a, b) => a + b, 0) : null;
}

/** Configure-run footer: agents run in parallel, so time = the slowest known
 *  average and cost = the sum of the known averages. */
export function footerEstimate(estimates: readonly Pick<AgentRunEstimate, "avg_duration_ms" | "avg_cost_usd">[]): {
  durationMs: number | null;
  costUsd: number | null;
} {
  return {
    durationMs: maxKnown(estimates.map((e) => e.avg_duration_ms)),
    costUsd: sumKnown(estimates.map((e) => e.avg_cost_usd)),
  };
}

/** Wall clock of a multi-agent run: from the parent's start to the last child's
 *  end. null while any child is still running or when no child has a known end. */
export function wallClockMs(parentRanAt: string, runs: readonly RunSummary[]): number | null {
  if (runs.some((r) => r.status === "running")) return null;
  const start = Date.parse(parentRanAt);
  if (!Number.isFinite(start)) return null;
  const ends = runs.flatMap((r) => {
    if (r.ran_at == null || r.duration_ms == null) return [];
    const ranAt = Date.parse(r.ran_at);
    return Number.isFinite(ranAt) ? [ranAt + r.duration_ms] : [];
  });
  if (ends.length === 0) return null;
  return Math.max(0, Math.max(...ends) - start);
}

/** A finished (or running) child run's "duration · cost" line; each unknown half is "—". */
export function formatRunMeta(run: Pick<RunSummary, "duration_ms" | "cost_usd">): string {
  return `${formatSeconds(run.duration_ms)} · ${formatUsd(run.cost_usd)}`;
}
