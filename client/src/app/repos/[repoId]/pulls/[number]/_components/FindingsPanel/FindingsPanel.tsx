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
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const { hideLow, setHideLow, severity, setSeverity, counts, shown } = useFindingsFilter(findings);
  const focusIdx = useFindingKeyboardNav(shown, (f, act) =>
    action.mutate({ findingId: f.id, action: act, prId }),
  );

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
              focused={i === focusIdx}
              defaultExpanded={i === 0}
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
