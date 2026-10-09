/* EvalsTab — one agent's eval set: the metric tiles of its latest finished
   suite run (with the change vs the run before), "N / M passing", and every case
   with its latest result. "Run all evals" starts a background suite run; while
   one is running the tab shows it and disables the run buttons, and refreshes
   itself when the run ends (the hooks poll). Cases can be created, edited, run
   one at a time and deleted (with a confirmation naming the case). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton, SectionLabel } from "@devdigest/ui";
import type { Agent, EvalCase } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  METRIC_COLOR,
  MetricTile,
  RunStatusLabel,
  formatPassed,
  formatPct,
  sparkValues,
} from "@/components/eval-metrics";
import {
  useAgentEvalCases,
  useAgentEvalDashboard,
  useAgentEvalRuns,
  useDeleteEvalCase,
  useRunAgentEvals,
  useRunEvalCase,
} from "@/lib/hooks/evals";
import { EvalCaseModal } from "./_components/EvalCaseModal";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { s } from "./styles";

/** `null` = closed, `"new"` = a blank form, otherwise the id of the case being edited. */
type ModalState = null | "new" | { editId: string };

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const cases = useAgentEvalCases(agent.id);
  const runs = useAgentEvalRuns(agent.id, "all");
  const dashboard = useAgentEvalDashboard(agent.id, "all");
  const runAll = useRunAgentEvals();
  const runCase = useRunEvalCase(agent.id);
  const remove = useDeleteEvalCase(agent.id);
  const [modal, setModal] = React.useState<ModalState>(null);
  const [deleting, setDeleting] = React.useState<EvalCase | null>(null);

  const list = cases.data ?? [];
  const suiteRunning = runAll.isPending || (runs.data ?? []).some((r) => r.status === "running");
  const current = dashboard.data?.current ?? null;
  const delta = dashboard.data?.delta ?? null;
  const trend = dashboard.data?.trend ?? [];
  // Derived from the live list, so a result stored by "Run case" shows at once.
  const editing = modal && modal !== "new" ? (list.find((c) => c.id === modal.editId) ?? null) : null;

  return (
    <div>
      <SectionLabel
        icon="Gauge"
        right={
          <Link href={`/eval/${agent.id}`} style={s.link}>
            {t("evalsTab.viewDashboard")}
          </Link>
        }
      >
        {t("evalsTab.metricsTitle")}
      </SectionLabel>
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
        <MetricTile
          label={t("metrics.passed")}
          value={current ? formatPassed(current.cases_passed, current.cases_total) : "—"}
          color="var(--text-primary)"
        />
      </div>

      <div style={s.casesHead}>
        <h2 style={s.casesTitle}>{t("evalsTab.casesHeading")}</h2>
        {current && current.cases_passed != null && (
          <span style={s.passing}>
            {t("evalsTab.passing", { passed: current.cases_passed, total: current.cases_total })}
          </span>
        )}
        {suiteRunning && <RunStatusLabel status="running" />}
        <div style={s.headActions}>
          <Button
            type="button"
            kind="secondary"
            icon="Play"
            loading={suiteRunning}
            disabled={list.length === 0}
            onClick={() => runAll.mutate(agent.id)}
          >
            {suiteRunning ? t("evalsTab.running") : t("evalsTab.runAll")}
          </Button>
          <Button type="button" kind="primary" icon="Plus" onClick={() => setModal("new")}>
            {t("evalsTab.newCase")}
          </Button>
        </div>
      </div>

      {cases.isLoading && <Skeleton height={80} />}
      {cases.isError && <p style={s.muted}>{t("evalsTab.loadError")}</p>}
      {cases.data && list.length === 0 && (
        <EmptyState icon="FlaskConical" title={t("evalsTab.emptyTitle")} body={t("evalsTab.emptyBody")} />
      )}
      {list.length > 0 && (
        <ul style={s.list} aria-label={t("evalsTab.casesHeading")}>
          {list.map((c) => (
            <EvalCaseRow
              key={c.id}
              evalCase={c}
              runDisabled={suiteRunning}
              running={runCase.isPending && runCase.variables === c.id}
              onRun={() => runCase.mutate(c.id)}
              onEdit={() => setModal({ editId: c.id })}
              onDelete={() => setDeleting(c)}
            />
          ))}
        </ul>
      )}

      {(modal === "new" || editing) && (
        <EvalCaseModal
          key={editing?.id ?? "new"}
          agentId={agent.id}
          agentName={agent.name}
          evalCase={editing}
          runDisabled={suiteRunning}
          onClose={() => setModal(null)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={t("evalsTab.deleteTitle")}
          body={t("evalsTab.deleteBody", { name: deleting.name })}
          confirmLabel={t("evalsTab.delete")}
          loading={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </div>
  );
}
