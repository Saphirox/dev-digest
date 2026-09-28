"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { blastTotals } from "../../helpers";
import { s } from "./styles";

/**
 * Stats row: icon + count + label per metric (symbols, callers, endpoints,
 * crons). Counts come from `helpers.blastTotals`, derived during render from
 * `blast` — never stored, so they can never drift from what the tree/graph
 * below actually shows.
 */
export function BlastSummary({ blast }: { blast: BlastRadius }) {
  const t = useTranslations("blast");
  const totals = blastTotals(blast);

  return (
    <div style={s.row}>
      <span style={s.stat} aria-label={`${totals.symbols} ${t("stat.symbols", { count: totals.symbols })}`}>
        <Icon.Code size={14} aria-hidden="true" />
        <span className="tnum" style={s.count} aria-hidden="true">
          {totals.symbols}
        </span>
        <span aria-hidden="true">{t("stat.symbols", { count: totals.symbols })}</span>
      </span>
      <span style={s.stat} aria-label={`${totals.callers} ${t("stat.callers", { count: totals.callers })}`}>
        <Icon.CornerDownRight size={14} aria-hidden="true" />
        <span className="tnum" style={s.count} aria-hidden="true">
          {totals.callers}
        </span>
        <span aria-hidden="true">{t("stat.callers", { count: totals.callers })}</span>
      </span>
      <span style={s.stat} aria-label={`${totals.endpoints} ${t("stat.endpoints", { count: totals.endpoints })}`}>
        <Icon.Globe size={14} aria-hidden="true" />
        <span className="tnum" style={s.count} aria-hidden="true">
          {totals.endpoints}
        </span>
        <span aria-hidden="true">{t("stat.endpoints", { count: totals.endpoints })}</span>
      </span>
      <span style={s.stat} aria-label={`${totals.crons} ${t("stat.crons", { count: totals.crons })}`}>
        <Icon.Clock size={14} aria-hidden="true" />
        <span className="tnum" style={s.count} aria-hidden="true">
          {totals.crons}
        </span>
        <span aria-hidden="true">{t("stat.crons", { count: totals.crons })}</span>
      </span>
    </div>
  );
}
