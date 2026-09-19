"use client";

import React from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity } from "@/lib/severity";
import { visibleFindings } from "./helpers";

/** The panel's two filters — "hide low confidence" and one severity — plus the
 *  per-severity counts the pills show. */
export function useFindingsFilter(findings: FindingRecord[]) {
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);

  // Counted BEFORE the severity filter but AFTER "hide low confidence", so a
  // pill's number always equals the cards rendered below it — including while
  // the toggle is on. Counting raw `findings` would over-count there.
  const afterConfidence = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countBySeverity(afterConfidence), [afterConfidence]);
  const shown = React.useMemo(
    () => (severity ? afterConfidence.filter((f) => f.severity === severity) : afterConfidence),
    [afterConfidence, severity],
  );

  return { hideLow, setHideLow, severity, setSeverity, counts, shown };
}
