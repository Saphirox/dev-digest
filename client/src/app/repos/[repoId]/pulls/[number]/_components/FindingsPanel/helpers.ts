import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** The three contract severities, worst first — the pill display order. */
export const SEVERITY_KEYS: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/**
 * Count findings per severity. Callers pass the list that is actually about to
 * be rendered (i.e. already past the low-confidence filter), so a pill's number
 * always equals the cards below it. An unrecognised severity is ignored.
 */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as Record<Severity, number>;
  for (const f of findings) {
    if ((SEVERITY_KEYS as readonly string[]).includes(f.severity)) counts[f.severity] += 1;
  }
  return counts;
}
