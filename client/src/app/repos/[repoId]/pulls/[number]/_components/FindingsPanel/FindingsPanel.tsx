/* FindingsPanel — severity pills + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "../FindingCard";
import { SeverityPills } from "./_components/SeverityPills";
import { useFindingKeyboardNav } from "./useFindingKeyboardNav";
import { useFindingsFilter } from "./useFindingsFilter";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  focusFindingId,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep-linked finding id. When it is among `shown` (this run's panel,
   *  post-filter), that card is expanded, focused, and scrolled to, and
   *  keyboard nav is seeded from it instead of index 0. */
  focusFindingId?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const { hideLow, setHideLow, severity, setSeverity, counts, shown } = useFindingsFilter(findings);
  const rawFocusIdx = focusFindingId ? shown.findIndex((f) => f.id === focusFindingId) : -1;
  const hasFocus = rawFocusIdx !== -1;
  const anchorIdx = hasFocus ? rawFocusIdx : 0;
  // While a deep link is live, only the panel that OWNS the linked finding is
  // active. Ownership is by `findings` (unfiltered), not `shown`, so a severity
  // pill hiding the target keeps its own panel active (focus falls back to 0)
  // rather than leaving no panel responding at all.
  const ownsTarget = focusFindingId != null && findings.some((f) => f.id === focusFindingId);
  const active = focusFindingId == null || ownsTarget;
  const focusIdx = useFindingKeyboardNav(
    shown,
    (f, act) => action.mutate({ findingId: f.id, action: act, prId }),
    anchorIdx,
    active,
  );

  // Runs after the accordion's own `scrollIntoView` (child effects commit
  // before the parent's), so the card wins and lands centred in view.
  React.useEffect(() => {
    if (!hasFocus || !focusFindingId) return;
    document.querySelector(`[data-finding-id="${focusFindingId}"]`)?.scrollIntoView({ block: "center" });
  }, [focusFindingId, hasFocus]);

  return (
    <div>
      <SeverityPills counts={counts} value={severity} onChange={setSeverity} />

      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={active && i === focusIdx}
              defaultExpanded={hasFocus ? f.id === focusFindingId : i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
