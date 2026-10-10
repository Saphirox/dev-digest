/* AgentEvalView — /eval/:agentId: one agent's eval history. Header with the
   period filter (?period=, 30 days by default) and "Run eval"; a warning when
   the latest done run dropped a metric (AC-36); the three metric tiles with
   signed changes and sparklines; the trend chart; and the run list, where two
   done runs can be picked and compared. The run list polls while a run is
   running and refreshes the rest when it ends (the hooks do that). */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { EvalPeriod } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import {
  METRIC_COLOR,
  MetricTile,
  MetricTrendChart,
  RunStatusLabel,
  formatPct,
  sparkValues,
} from "@/components/eval-metrics";
import { useAgent, useAgentVersions } from "@/lib/hooks/agents";
import {
  useAgentEvalDashboard,
  useAgentEvalRuns,
  useRunAgentEvals,
} from "@/lib/hooks/evals";
import { CompareRunsModal } from "./_components/CompareRunsModal";
import { PeriodFilter } from "./_components/PeriodFilter";
import { RegressionBanner } from "./_components/RegressionBanner";
import { RunsTable } from "./_components/RunsTable";
import { comparePair, parsePeriod } from "./helpers";
import { s } from "./styles";

export function AgentEvalView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const pathname = usePathname();
  const period = parsePeriod(useSearchParams().get("period"));
  const agent = useAgent(agentId);
  const dashboard = useAgentEvalDashboard(agentId, period);
  const runs = useAgentEvalRuns(agentId, period);
  const versions = useAgentVersions(agentId);
  const runEval = useRunAgentEvals();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);

  const list = runs.data ?? [];
  const running = runEval.isPending || list.some((r) => r.status === "running");
  const current = dashboard.data?.current ?? null;
  const delta = dashboard.data?.delta ?? null;
  const trend = dashboard.data?.trend ?? [];
  const casesTotal = dashboard.data?.cases_total ?? 0;
  const pair = comparePair(list, selected);
  const selectedCount = list.filter((r) => r.status === "done" && selected.includes(r.id)).length;

  const changePeriod = (p: EvalPeriod) => router.replace(`${pathname}?period=${p}`);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const name = agent.data?.name ?? "";
  const crumb = [
    { label: t("dashboard.crumbLab") },
    { label: t("dashboard.title"), href: "/eval" },
    ...(name ? [{ label: name }] : []),
  ];

  if (agent.isError) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState title={t("agentPage.notFound")} onRetry={() => void agent.refetch()} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          <Icon.ChevronLeft size={15} aria-hidden="true" />
          {t("agentPage.allAgents")}
        </Link>

        <div style={s.head}>
          <div>
            <div style={s.titleRow}>
              {name ? <h1 style={s.title}>{name}</h1> : <Skeleton width={220} height={28} />}
              {agent.data && <Badge mono>{agent.data.model}</Badge>}
            </div>
            <p style={s.subtitle}>{t("agentPage.subtitle", { runs: list.length, cases: casesTotal })}</p>
          </div>
          <div style={s.headActions}>
            {running && <RunStatusLabel status="running" />}
            <PeriodFilter value={period} onChange={changePeriod} />
            <Button
              type="button"
              kind="primary"
              icon="Play"
              loading={running}
              disabled={casesTotal === 0}
              onClick={() => runEval.mutate(agentId)}
            >
              {running ? t("agentPage.running") : t("agentPage.runEval")}
            </Button>
          </div>
        </div>

        {dashboard.data?.regression && <RegressionBanner regression={dashboard.data.regression} />}

        <div style={s.tiles}>
          <MetricTile
            label={t("metrics.recall")}
            value={formatPct(current?.recall)}
            delta={delta?.recall}
            trend={sparkValues(trend, "recall")}
            color={METRIC_COLOR.recall}
          />
          <MetricTile
            label={t("metrics.precision")}
            value={formatPct(current?.precision)}
            delta={delta?.precision}
            trend={sparkValues(trend, "precision")}
            color={METRIC_COLOR.precision}
          />
          <MetricTile
            label={t("metrics.citation")}
            value={formatPct(current?.citation_accuracy)}
            delta={delta?.citation_accuracy}
            trend={sparkValues(trend, "citation_accuracy")}
            color={METRIC_COLOR.citation_accuracy}
          />
        </div>

        <div style={s.card}>
          <SectionLabel icon="TrendingUp">{t("agentPage.trend")}</SectionLabel>
          {trend.length === 0 ? <p style={s.muted}>{t("agentPage.noTrend")}</p> : <MetricTrendChart trend={trend} />}
        </div>

        <div style={s.runsHead}>
          <SectionLabel icon="History">{t("agentPage.runs")}</SectionLabel>
          {selectedCount > 0 && <span style={s.selected}>{t("agentPage.selected", { count: selectedCount })}</span>}
          <div style={s.compare}>
            <Button type="button" kind="primary" icon="GitBranch" disabled={!pair} onClick={() => setComparing(true)}>
              {t("agentPage.compare")}
            </Button>
          </div>
        </div>
        {runs.isLoading && <Skeleton height={120} />}
        {runs.isError && <ErrorState title={t("agentPage.loadError")} onRetry={() => void runs.refetch()} />}
        {runs.data && list.length === 0 && (
          <EmptyState icon="FlaskConical" title={t("agentPage.noRunsTitle")} body={t("agentPage.noRunsBody")} />
        )}
        {list.length > 0 && <RunsTable runs={list} selectedIds={selected} onToggle={toggle} />}

        {comparing && pair && (
          <CompareRunsModal
            agentId={agentId}
            older={pair[0]}
            newer={pair[1]}
            currentVersion={agent.data?.version ?? null}
            versions={versions.data}
            onClose={() => setComparing(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
