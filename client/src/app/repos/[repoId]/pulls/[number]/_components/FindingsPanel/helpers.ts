import type { FindingRecord } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return sortBySeverity(
    hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings,
  );
}
