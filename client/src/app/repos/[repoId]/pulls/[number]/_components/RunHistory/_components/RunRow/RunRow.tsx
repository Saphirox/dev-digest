/* RunRow — one agent run on the PR timeline: outcome badge, score, agent +
   model, error or findings summary, usage, and the trace/delete actions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { RunFindingsSummary } from "../RunFindingsSummary";
import { outcomeOf, totalTokens } from "./helpers";
import { s } from "./styles";

export function RunRow({
  run,
  findings,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  /** This run's findings, severity-sorted; empty when no review matched. */
  findings: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(run);
  const settled = run.status === "done";

  return (
    <div style={s.row}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && run.score != null && <CircularScore score={run.score} size={30} stroke={3} />}
      <div style={s.body}>
        <div style={s.heading}>
          <button
            type="button"
            onClick={() => onGoToReview?.(run.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentLink(onGoToReview != null)}
          >
            {run.agent_name ?? "Agent"}
          </button>{" "}
          <span className="mono" style={s.model}>
            {run.provider}/{run.model}
          </span>
        </div>
        {run.status === "failed" && run.error && (
          <div style={s.error} title={run.error}>
            {run.error}
          </div>
        )}
        {settled && <RunFindingsSummary run={run} findings={findings} />}
      </div>
      <div style={s.meta}>
        {run.ran_at && <span>{new Date(run.ran_at).toLocaleTimeString()}</span>}
        {/* Usage only once the run has settled: an in-flight run has no
            cost yet, and a failed one shows its error instead. */}
        {settled && (run.tokens_in != null || run.cost_usd != null) && (
          <RunCostBadge variant="inline" cost={run.cost_usd} tokens={totalTokens(run)} />
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(run.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && run.status !== "running" && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(run.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </button>
      )}
    </div>
  );
}
