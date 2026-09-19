/* FindingsPreviewCard — hover popover listing findings (severity, title,
   category, file:line, confidence, truncated rationale). Lives here rather
   than beside the timeline because the PR list's FINDINGS column is meant to
   reuse it. */
"use client";

import React from "react";
import { Icon, SeverityBadge, CategoryTag, type Severity as UiSeverity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

/**
 * Confidence readout — a local copy of @devdigest/ui's ConfidenceNum, minus its
 * hardcoded `title="Model confidence"`. That title is the only tooltip on this
 * card and it makes the browser show a help/"?" cursor over a surface that is
 * not a help affordance. The primitive exposes no way to suppress it and
 * vendor/ui is not ours to edit, so the ~8 lines are duplicated on purpose —
 * don't "simplify" this back to ConfidenceNum.
 */
function ConfidencePct({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const dot = pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
  return (
    <span className="mono tnum" style={s.conf}>
      <span style={s.confDot(dot)} />
      {pct}% conf
    </span>
  );
}

export function FindingsPreviewCard({
  findings,
  title,
  top,
  left,
}: {
  findings: FindingRecord[];
  /** Translated header, e.g. "2 findings in this run". */
  title: string;
  /** Viewport coordinates of the card's top-left corner. */
  top: number;
  left: number;
}) {
  return (
    <div style={s.card(top, left)} onClick={(e) => e.stopPropagation()}>
      <div style={s.title}>
        <Icon.AlertOctagon size={12} />
        {title}
      </div>
      {findings.map((f) => (
        <div key={f.id} style={s.item}>
          <div style={s.head}>
            <SeverityBadge severity={f.severity as UiSeverity} compact />
            <span style={s.itemTitle}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={s.meta}>
            {/* plain span, not MonoLink: RunHistory has no repo/head sha to
                build a GitHub href, and a link with no href is a dead button. */}
            <span className="mono" style={s.file}>
              {f.file}:{f.start_line}
            </span>
            <ConfidencePct value={f.confidence} />
          </div>
          <div style={s.rationale}>{f.rationale}</div>
        </div>
      ))}
    </div>
  );
}

export default FindingsPreviewCard;
