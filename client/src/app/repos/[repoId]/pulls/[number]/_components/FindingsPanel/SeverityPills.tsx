/* SeverityPills — the "N CRITICAL · N WARNING · N SUGGESTION" row inside an
   expanded review run, directly under its verdict. Clicking a pill narrows the
   findings below to that severity; clicking the active one clears the filter.
   Only severities actually present get a pill. */
"use client";

import React from "react";
// `Severity` comes from the CONTRACT (3 values); @devdigest/ui's own
// Severity adds a 4th (INFO) that findings can never carry, so the badge call
// below casts rather than widening this component's props.
import { SeverityBadge, type Severity as UiSeverity } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_KEYS } from "./helpers";
import { s } from "./styles";

export function SeverityPills({
  counts,
  value,
  onChange,
}: {
  counts: Record<Severity, number>;
  /** Currently filtered severity, or null for "all". */
  value: Severity | null;
  onChange: (next: Severity | null) => void;
}) {
  const present = SEVERITY_KEYS.filter((k) => counts[k] > 0);
  if (present.length === 0) return null;

  return (
    <div style={s.pillRow} role="group" aria-label="Filter this run's findings by severity">
      {present.map((sev) => {
        const active = value === sev;
        return (
          <button
            key={sev}
            type="button"
            onClick={() => onChange(active ? null : sev)}
            aria-pressed={active}
            aria-label={`${counts[sev]} ${sev}`}
            style={s.pill(active, value != null)}
          >
            <SeverityBadge severity={sev as UiSeverity} count={counts[sev]} />
          </button>
        );
      })}
    </div>
  );
}

export default SeverityPills;
