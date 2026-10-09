/* MetricTrendChart — recall / precision / citation accuracy per done run.
   Recharts directly (the library LineChart turns an unknown point into 0): an
   unknown metric is a gap in the line, never a drop to zero. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EvalMetricName, EvalTrendPoint } from "@devdigest/shared";
import { METRIC_COLOR, formatPct, formatRanAt } from "./helpers";
import { s } from "./styles";

const SERIES: { key: EvalMetricName; legend: "recall" | "precision" | "citation" }[] = [
  { key: "recall", legend: "recall" },
  { key: "precision", legend: "precision" },
  { key: "citation_accuracy", legend: "citation" },
];

export function MetricTrendChart({ trend }: { trend: EvalTrendPoint[] }) {
  const t = useTranslations("eval");
  const rows = trend.map((p) => ({
    run: p.run_id,
    name: `v${p.agent_version}`,
    ran_at: p.ran_at,
    recall: p.recall,
    precision: p.precision,
    citation_accuracy: p.citation_accuracy,
  }));
  return (
    <div>
      <div style={s.legend}>
        {SERIES.map((x) => (
          <span key={x.key} style={s.legendItem}>
            <span aria-hidden="true" style={s.swatch(METRIC_COLOR[x.key])} />
            {t(`legend.${x.legend}`)}
          </span>
        ))}
      </div>
      <div style={s.chartWrap} role="img" aria-label={t("trendLabel", { count: trend.length })}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 14, right: 14, bottom: 8, left: -6 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, 1]}
              tick={{ fontSize: 12, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => formatPct(v)}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v: unknown) => (typeof v === "number" ? formatPct(v) : "—")}
              labelFormatter={(_l, items) => {
                const row = items?.[0]?.payload as { name: string; ran_at: string } | undefined;
                return row ? `${row.name} · ${formatRanAt(row.ran_at)}` : "";
              }}
              contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", fontSize: 12.5 }}
            />
            {SERIES.map((x) => (
              <Line
                key={x.key}
                type="monotone"
                dataKey={x.key}
                name={t(`legend.${x.legend}`)}
                stroke={METRIC_COLOR[x.key]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
