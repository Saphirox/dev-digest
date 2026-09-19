/* RunFindingsSummary — the findings line under a settled timeline run: the
   per-severity chips plus a hover card listing the run's findings. Falls back
   to the plain "N findings" count when the run has no matched review. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { FindingsPreviewCard, SeverityCountChips, useHoverPreview } from "@/components/findings-preview";
import { countBySeverity } from "@/lib/severity";
import { s } from "./styles";

export function RunFindingsSummary({
  run,
  findings,
}: {
  run: RunSummary;
  /** This run's findings, already sorted by severity; empty when no review matched. */
  findings: FindingRecord[];
}) {
  const t = useTranslations("prReview");
  const { anchor, onMouseEnter, onMouseLeave } = useHoverPreview();
  const blockers = run.blockers ?? 0;

  // No matched review (deleted, or a summary-only run) — keep the plain count
  // line rather than showing nothing.
  if (findings.length === 0) {
    return (
      <div style={s.countLine}>
        {t("runStatus.findings", { count: run.findings_count ?? 0 })}
        {blockers > 0 ? t("runStatus.blockers", { count: blockers }) : ""}
      </div>
    );
  }

  return (
    <div style={s.chipsRow} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <SeverityCountChips counts={countBySeverity(findings)} />
      {blockers > 0 && <span style={s.blockers}>{t("runStatus.blockers", { count: blockers })}</span>}
      {anchor && (
        <FindingsPreviewCard
          findings={findings}
          title={t("timeline.findingsInRun", { count: findings.length })}
          top={anchor.top}
          left={anchor.left}
        />
      )}
    </div>
  );
}
