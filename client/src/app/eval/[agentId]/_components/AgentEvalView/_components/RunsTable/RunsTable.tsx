/* RunsTable — the agent's suite runs, newest first: ran-at, version, status,
   the three metrics, passed / total and cost. Done runs have a checkbox (a
   native one, so Tab and Space work); a failed run says so, and why, instead of
   showing scores. Unknown metrics and cost are dashes (EC-6, EC-12). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalMetricName, EvalSuiteRun } from "@devdigest/shared";
import {
  METRIC_COLOR,
  MetricBar,
  RunStatusLabel,
  formatPassed,
  formatRanAt,
} from "@/components/eval-metrics";
import { formatUsd } from "@/lib/format-usd";
import { s } from "./styles";

const METRICS: { key: EvalMetricName; head: "recall" | "precision" | "citation" }[] = [
  { key: "recall", head: "recall" },
  { key: "precision", head: "precision" },
  { key: "citation_accuracy", head: "citation" },
];

export function RunsTable({
  runs,
  selectedIds,
  onToggle,
}: {
  runs: EvalSuiteRun[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th} scope="col" aria-label={t("table.select")} />
            {(["ranAt", "version", "status"] as const).map((k) => (
              <th key={k} style={s.th} scope="col">
                {t(`table.${k}`)}
              </th>
            ))}
            {METRICS.map((m) => (
              <th key={m.key} style={s.th} scope="col">
                {t(`table.${m.head}`)}
              </th>
            ))}
            {(["pass", "cost"] as const).map((k) => (
              <th key={k} style={s.th} scope="col">
                {t(`table.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const when = formatRanAt(r.started_at);
            return (
              <tr key={r.id} data-testid={`run-${r.id}`}>
                <td style={s.td}>
                  {r.status === "done" && (
                    <input
                      type="checkbox"
                      style={s.check}
                      checked={selectedIds.includes(r.id)}
                      onChange={() => onToggle(r.id)}
                      aria-label={t("table.selectRun", { version: r.agent_version, when })}
                    />
                  )}
                </td>
                <td className="mono" style={s.td}>
                  {when}
                </td>
                <td className="mono" style={{ ...s.td, ...s.version }}>
                  v{r.agent_version}
                </td>
                <td style={s.td}>
                  <RunStatusLabel status={r.status} />
                  {r.status === "failed" && (r.failing_case || r.error) && (
                    <span style={s.why}>
                      {r.failing_case ? t("table.failedOn", { name: r.failing_case }) : r.error}
                    </span>
                  )}
                </td>
                {METRICS.map((m) => (
                  <td key={m.key} style={s.td}>
                    <MetricBar value={r[m.key]} color={METRIC_COLOR[m.key]} />
                  </td>
                ))}
                <td className="tnum" style={s.tdStrong}>
                  {formatPassed(r.cases_passed, r.cases_total)}
                </td>
                <td className="tnum" style={s.td}>
                  {formatUsd(r.cost_usd)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
