/* EvalDashboardView — /eval: every agent that has eval cases with its latest
   suite run (version, time, passed / total, recall / precision / citation and a
   sparkline), and the most recent suite runs across all agents. "Run all agents"
   starts one background run per agent; an agent that is already running says so
   and the rest still start (EC-19). The lists poll while a run is running. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalMetricName, EvalOverviewAgent } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import {
  METRIC_COLOR,
  MetricBar,
  RunStatusLabel,
  formatPassed,
  formatPct,
  formatRanAt,
  sparkValues,
} from "@/components/eval-metrics";
import { useEvalOverview, useRunAllAgentEvals, type RunAllOutcome } from "@/lib/hooks/evals";
import { outcomesByAgent } from "./helpers";
import { s } from "./styles";

const METRICS: { key: EvalMetricName; head: "recall" | "precision" | "citation"; short: "recall" | "prec" | "cite" }[] = [
  { key: "recall", head: "recall", short: "recall" },
  { key: "precision", head: "precision", short: "prec" },
  { key: "citation_accuracy", head: "citation", short: "cite" },
];

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const overview = useEvalOverview();
  const runAll = useRunAllAgentEvals();
  const agents = overview.data?.agents ?? [];
  const recent = overview.data?.recent_runs ?? [];
  const outcomes = outcomesByAgent(runAll.data);
  const crumb = [{ label: t("dashboard.crumbLab") }, { label: t("dashboard.title") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>{t("dashboard.title")}</h1>
            <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
          </div>
          <div style={s.headActions}>
            <Button
              type="button"
              kind="primary"
              icon="Play"
              loading={runAll.isPending}
              disabled={agents.length === 0}
              onClick={() => runAll.mutate(agents.map((a) => a.agent_id))}
            >
              {t("dashboard.runAll")}
            </Button>
          </div>
        </div>

        {overview.isLoading && <Skeleton height={140} />}
        {overview.isError && <ErrorState title={t("dashboard.loadError")} onRetry={() => void overview.refetch()} />}

        {overview.data && (
          <>
            <SectionLabel icon="Cpu">{t("dashboard.agents")}</SectionLabel>
            {agents.length === 0 ? (
              <EmptyState icon="FlaskConical" title={t("dashboard.emptyTitle")} body={t("dashboard.emptyBody")} />
            ) : (
              <ul style={s.list} aria-label={t("dashboard.agents")}>
                {agents.map((a) => (
                  <AgentRow key={a.agent_id} agent={a} outcome={outcomes[a.agent_id]} />
                ))}
              </ul>
            )}

            <SectionLabel icon="History">{t("dashboard.recentRuns")}</SectionLabel>
            {recent.length === 0 ? (
              <p style={s.muted}>{t("dashboard.noRuns")}</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {(["agent", "ranAt", "version", "status"] as const).map((k) => (
                        <th key={k} style={s.th} scope="col">
                          {t(`table.${k}`)}
                        </th>
                      ))}
                      {METRICS.map((m) => (
                        <th key={m.key} style={s.th} scope="col">
                          {t(`table.${m.head}`)}
                        </th>
                      ))}
                      <th style={s.th} scope="col">
                        {t("table.pass")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id}>
                        <td style={s.tdStrong}>{r.agent_name}</td>
                        <td className="mono" style={s.td}>
                          {formatRanAt(r.started_at)}
                        </td>
                        <td className="mono" style={{ ...s.td, ...s.version }}>
                          v{r.agent_version}
                        </td>
                        <td style={s.td}>
                          <RunStatusLabel status={r.status} />
                        </td>
                        {METRICS.map((m) => (
                          <td key={m.key} style={s.td}>
                            <MetricBar value={r[m.key]} color={METRIC_COLOR[m.key]} />
                          </td>
                        ))}
                        <td className="tnum" style={s.tdStrong}>
                          {formatPassed(r.cases_passed, r.cases_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function AgentRow({ agent, outcome }: { agent: EvalOverviewAgent; outcome?: RunAllOutcome }) {
  const t = useTranslations("eval");
  const run = agent.latest_run;
  const running = run?.status === "running";
  return (
    <li>
      <Link href={`/eval/${agent.agent_id}`} style={s.row}>
        <span style={s.rowIcon}>
          <Icon.Cpu size={18} aria-hidden="true" />
        </span>
        <div style={s.rowMain}>
          <div style={s.rowName}>
            {agent.agent_name}
            <Badge mono>{agent.model}</Badge>
          </div>
          <div style={s.rowSub}>
            {run ? (
              <>
                {run.status === "done" ? (
                  <span>{t("dashboard.lastRun")}</span>
                ) : (
                  <RunStatusLabel status={run.status} />
                )}
                <span className="mono">
                  v{run.agent_version} · {formatRanAt(run.started_at)}
                </span>
                {run.status === "done" && <span>{t("dashboard.passLabel", { passed: formatPassed(run.cases_passed, run.cases_total) })}</span>}
                {run.status === "failed" && run.failing_case && (
                  <span>{t("dashboard.failedOn", { name: run.failing_case })}</span>
                )}
              </>
            ) : (
              <span>{t("dashboard.neverRun")}</span>
            )}
            {outcome?.status === "already_running" && running && <span style={s.note}>{t("dashboard.alreadyRunning")}</span>}
            {outcome?.status === "failed" && (
              <span style={s.note}>{t("dashboard.couldNotStart", { reason: outcome.message })}</span>
            )}
          </div>
        </div>
        <TrendSpark agent={agent} />
        <div style={s.metrics}>
          {METRICS.map((m) => {
            const v = run?.[m.key] ?? null;
            return (
              <div key={m.key} style={s.metric}>
                <span style={s.metricLabel}>{t(`dashboard.short.${m.short}`)}</span>
                <span className="tnum" style={s.metricValue(METRIC_COLOR[m.key], v != null)}>
                  {formatPct(v)}
                </span>
              </div>
            );
          })}
        </div>
        <Icon.ChevronRight size={16} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      </Link>
    </li>
  );
}

function TrendSpark({ agent }: { agent: EvalOverviewAgent }) {
  const data = sparkValues(agent.trend, "recall");
  if (data.length < 2) return <span style={{ width: 80 }} />;
  return <Sparkline data={data} color={METRIC_COLOR.recall} w={80} h={28} />;
}
