import type { FindingRecord, PrCommit, ReviewRecord, RunSummary } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/severity";

export type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
export function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Runs and commits interleaved into one newest-first timeline. */
export function buildTimeline(runs: RunSummary[], commits: PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run): TimelineItem => ({ kind: "run", ts: tsOf(run.ran_at), run })),
    ...commits.map((commit): TimelineItem => ({ kind: "commit", ts: tsOf(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}

/** Each run's findings (severity-sorted), joined from the reviews by `run_id`.
 *  Reviews with no run or no findings are left out, so a missing key means
 *  "show the plain count line". */
export function findingsByRunId(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const map = new Map<string, FindingRecord[]>();
  for (const rv of reviews) {
    if (rv.run_id && rv.findings.length > 0) map.set(rv.run_id, sortBySeverity(rv.findings));
  }
  return map;
}
