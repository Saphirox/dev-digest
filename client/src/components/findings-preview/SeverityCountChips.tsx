/* SeverityCountChips — the per-severity counts shown on a timeline run:
   a bare severity-coloured icon + number under a dotted underline, per the
   lab design. Deliberately NOT `SeverityBadge` from @devdigest/ui: that
   primitive always draws a filled pill (background + radius + padding +
   uppercase) and exposes no variant prop, and vendor/ui is not ours to edit.
   Only its SEV token map is reused, so the colours stay in one place. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITIES } from "@/lib/severity";
import { s } from "./styles";

export function SeverityCountChips({ counts }: { counts: Record<Severity, number> }) {
  return (
    <>
      {SEVERITIES.map((sev) => {
        const count = counts[sev] ?? 0;
        if (count === 0) return null;
        const I = Icon[SEV[sev].icon];
        return (
          // aria-label, never title: a title attribute on a non-interactive
          // surface makes the browser show a help/"?" cursor.
          <span key={sev} style={s.chip(SEV[sev].c)} aria-label={`${count} ${SEV[sev].label}`}>
            <I size={14} />
            <span className="tnum">{count}</span>
          </span>
        );
      })}
    </>
  );
}

export default SeverityCountChips;
