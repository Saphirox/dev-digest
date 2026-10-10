/** Pure rules for the "Where agents disagree" block. */
import type { FindingGroup, FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import { severityRank } from "@/lib/severity";

/** A finding by id, across every review of the multi-agent run. */
export function findingsById(reviews: readonly ReviewRecord[]): Map<string, FindingRecord> {
  return new Map(reviews.flatMap((r) => r.findings).map((f) => [f.id, f]));
}

/**
 * A row's title and line: the title of the group's highest-severity member
 * finding, the line of its smallest start. A severity tie goes to the agent
 * listed first in `runs` (the order the agents were selected in).
 */
export function rowTitle(
  group: FindingGroup,
  runs: readonly RunSummary[],
  byId: ReadonlyMap<string, FindingRecord>,
): { title: string; line: number } {
  const runOrder = (runId: string) => {
    const i = runs.findIndex((r) => r.run_id === runId);
    return i === -1 ? runs.length : i;
  };
  const members = group.members.flatMap((m) => {
    const finding = byId.get(m.finding_id);
    return finding ? [{ finding, order: runOrder(m.run_id) }] : [];
  });
  const best = [...members].sort(
    (a, b) => severityRank(a.finding.severity) - severityRank(b.finding.severity) || a.order - b.order,
  )[0];
  const line = members.length > 0 ? Math.min(...members.map((m) => m.finding.start_line)) : group.start_line;
  return { title: best?.finding.title ?? "", line };
}

export type Cell =
  | { kind: "finding"; severity: FindingRecord["severity"]; title: string }
  | { kind: "didNotFlag" }
  | { kind: "status"; status: "running" | "failed" | "cancelled" };

/** One agent's cell in one row: its finding, "did not flag" (a `done` run with
 *  no member) or its status (running / failed / cancelled, which never counts as a conflict). */
export function cellFor(run: RunSummary, group: FindingGroup, byId: ReadonlyMap<string, FindingRecord>): Cell {
  const member = group.members.find((m) => m.run_id === run.run_id);
  const finding = member ? byId.get(member.finding_id) : undefined;
  if (finding) return { kind: "finding", severity: finding.severity, title: finding.title };
  if (run.status === "running" || run.status === "failed" || run.status === "cancelled") {
    return { kind: "status", status: run.status };
  }
  return { kind: "didNotFlag" };
}

/** Whether there are enough finished runs to compare (fewer than two → a hint instead of rows). */
export function canCompare(runs: readonly RunSummary[]): boolean {
  return runs.filter((r) => r.status === "done").length >= 2;
}
