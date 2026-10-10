/* DisagreementBlock — "Where agents disagree": one row per finding group
   (file:line + title), one cell per agent that took part in the run. Computed
   by the server on every read; the conflicts-only toggle filters locally. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, SectionLabel, Toggle } from "@devdigest/ui";
import type { FindingGroup, ReviewRecord, RunSummary } from "@devdigest/shared";
import { canCompare, cellFor, findingsById, rowTitle, type Cell } from "./helpers";
import { s } from "./styles";

function CellState({ cell }: { cell: Cell }) {
  const t = useTranslations("multiAgent");
  if (cell.kind === "finding") {
    const color = SEV[cell.severity].c;
    return (
      <>
        <div style={s.cellState(color)}>
          <span style={s.dot(color)} />
          {t(`disagree.severity.${cell.severity}`)}
        </div>
        <div style={s.cellTitle}>{cell.title}</div>
      </>
    );
  }
  const text = cell.kind === "didNotFlag" ? t("disagree.didNotFlag") : t(`disagree.${cell.status}`);
  return (
    <div style={{ ...s.cellState("var(--text-muted)"), ...s.cellMuted }}>
      <span style={s.dot("var(--text-muted)")} />
      {text}
    </div>
  );
}

export function DisagreementBlock({
  runs,
  reviews,
  groups,
}: {
  runs: RunSummary[];
  reviews: ReviewRecord[];
  groups: FindingGroup[];
}) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const byId = findingsById(reviews);
  const shown = onlyConflicts ? groups.filter((g) => g.conflict) : groups;

  return (
    <section aria-label={t("disagree.title")} style={s.wrap}>
      <SectionLabel
        icon="Activity"
        right={
          <label style={s.toggle}>
            {t("disagree.showOnlyConflicts")}
            <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} />
          </label>
        }
      >
        {t("disagree.title")}
      </SectionLabel>

      {!canCompare(runs) ? (
        <p style={s.note}>{t("disagree.needTwo")}</p>
      ) : shown.length === 0 ? (
        <p style={s.note}>{t("disagree.noConflicts")}</p>
      ) : (
        <div style={s.rows}>
          {shown.map((g) => {
            const { title, line } = rowTitle(g, runs, byId);
            return (
              <div key={`${g.file}:${g.start_line}:${g.end_line}`} style={s.row}>
                <div style={s.rowHead}>
                  <Icon.Code size={14} style={{ color: "var(--text-muted)" }} />
                  <span className="mono" style={s.loc}>
                    {g.file}:{line}
                  </span>
                  <span style={s.rowTitle}>{title}</span>
                </div>
                <div style={s.cells(runs.length)}>
                  {runs.map((r) => (
                    <div key={r.run_id} style={s.cell}>
                      <div style={s.cellAgent}>{r.agent_name}</div>
                      <CellState cell={cellFor(r, g, byId)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
