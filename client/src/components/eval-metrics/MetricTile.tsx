/* MetricTile — one KPI: a big value ("82%", or "—" when unknown), its signed
   change vs the previous run with an arrow and an accessible name, and a
   sparkline of the metric over the agent's done runs. Built locally because the
   library MetricCard drops the delta's sign and labels no arrow, and its
   sparkline can't skip unknown points (client INSIGHTS 2026-10-06). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import { DeltaChip } from "./DeltaChip";
import { formatDelta } from "./helpers";
import { s } from "./styles";

export function MetricTile({
  label,
  value,
  delta,
  trend,
  color = "var(--accent)",
}: {
  label: string;
  /** Already formatted: "82%", "17/20" or "—". */
  value: string;
  /** Change vs the previous run, as a fraction; null/undefined shows no delta. */
  delta?: number | null;
  /** Metric values over the done runs, oldest first; unknown points already removed. */
  trend?: number[];
  color?: string;
}) {
  const t = useTranslations("eval");
  const d = formatDelta(delta);
  const deltaName = d ? t(`delta.${d.direction}`, { label, points: d.points }) : "";
  return (
    <div style={s.tile} data-testid={`metric-${label}`}>
      <div style={s.tileTop}>
        <span style={s.tileLabel}>{label}</span>
        {trend && trend.length > 1 && <Sparkline data={trend} color={color} w={56} h={20} />}
      </div>
      <div style={s.tileValueRow}>
        <span className="tnum" style={s.tileValue(color, value !== "—")}>
          {value}
        </span>
        {d && <DeltaChip name={deltaName} text={d.text} direction={d.direction} />}
      </div>
    </div>
  );
}
