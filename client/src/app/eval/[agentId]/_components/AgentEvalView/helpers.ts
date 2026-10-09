import type { EvalPeriod, EvalSuiteRun } from "@devdigest/shared";

/** Period options in menu order; the labels come from `eval.period.*`. */
export const PERIODS: readonly EvalPeriod[] = ["7d", "30d", "90d", "all"];
export const DEFAULT_PERIOD: EvalPeriod = "30d";

/** The `?period=` value if it names a period, else 30 days (AC-39). */
export function parsePeriod(raw: string | null | undefined): EvalPeriod {
  return PERIODS.find((p) => p === raw) ?? DEFAULT_PERIOD;
}

/** The two selected done runs as [older, newer], or null unless exactly two are selected. */
export function comparePair(runs: EvalSuiteRun[], selectedIds: string[]): [EvalSuiteRun, EvalSuiteRun] | null {
  const picked = runs.filter((r) => r.status === "done" && selectedIds.includes(r.id));
  if (picked.length !== 2) return null;
  const [a, b] = picked as [EvalSuiteRun, EvalSuiteRun];
  return Date.parse(a.started_at) <= Date.parse(b.started_at) ? [a, b] : [b, a];
}

/** Why "Promote vN" is unavailable, or null when it is allowed (EC-16, EC-25). */
export type PromoteBlock = "current" | "noSnapshot" | "loading" | null;

export function promoteBlock(
  version: number,
  currentVersion: number | null,
  snapshotVersions: number[] | undefined,
): PromoteBlock {
  if (currentVersion != null && version === currentVersion) return "current";
  if (snapshotVersions === undefined) return "loading";
  if (!snapshotVersions.includes(version)) return "noSnapshot";
  return null;
}
