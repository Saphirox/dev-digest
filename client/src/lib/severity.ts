/**
 * Severity rules for findings — the one place that knows the display order
 * and how to count per severity. Pure, no React: every severity surface (run
 * pills, timeline chips, PR-list column, hover preview) reads from here so
 * they cannot disagree on order.
 *
 * Typed against the CONTRACT `Severity` (3 values), not @devdigest/ui's, which
 * adds an INFO that findings never carry.
 */
import type { Severity } from "@devdigest/shared";

/** The contract severities, worst first — the display and sort order. */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

/** Position in `SEVERITIES`; anything unrecognised sorts after all of them. */
function rank(severity: string): number {
  const i = (SEVERITIES as readonly string[]).indexOf(severity);
  return i === -1 ? SEVERITIES.length : i;
}

/** A copy sorted CRITICAL → WARNING → SUGGESTION; ties keep their input order. */
export function sortBySeverity<T extends { severity: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => rank(a.severity) - rank(b.severity));
}

/** Count per severity. Callers pass the list actually being represented, so a
 *  chip's number always matches what it stands for. */
export function countBySeverity(items: readonly { severity: string }[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const { severity } of items) {
    if (severity in counts) counts[severity as Severity] += 1;
  }
  return counts;
}
