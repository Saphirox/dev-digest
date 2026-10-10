/* AgentTabs — Tabs mode: one tab per child run (name + score); the selected tab
   shows a summary card and that agent's findings as the expandable FindingCards
   (Accept / Dismiss / Turn into eval case). Accept and Dismiss act on exactly one
   finding; the page then refetches so every group reflects it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, Tabs } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { useFindingAction } from "@/lib/hooks/reviews";
import { formatRunMeta } from "@/lib/run-estimate";
import { s } from "./styles";

export function AgentTabs({
  prId,
  runs,
  reviews,
  onViewTrace,
  onChanged,
}: {
  prId: string;
  runs: RunSummary[];
  reviews: ReviewRecord[];
  onViewTrace: (runId: string) => void;
  /** Called after an Accept / Dismiss succeeded (refetch the multi-run). */
  onChanged: () => void;
}) {
  const t = useTranslations("multiAgent");
  const action = useFindingAction();
  const [picked, setPicked] = React.useState<string | null>(null);
  // Derived: a stale or missing pick falls back to the first run.
  const run = runs.find((r) => r.run_id === picked) ?? runs[0];
  if (!run) return null;
  const review = reviews.find((r) => r.run_id === run.run_id);
  const findings = review?.findings ?? [];
  const name = run.agent_name ?? t("results.unknownAgent");
  const failed = run.status === "failed" || run.status === "cancelled";

  return (
    <div>
      <Tabs
        pad="0"
        value={run.run_id}
        onChange={setPicked}
        tabs={runs.map((r) => ({
          key: r.run_id,
          label: r.agent_name ?? t("results.unknownAgent"),
          icon: "Cpu" as const,
          ...(r.status === "done" && r.score != null ? { count: r.score } : {}),
        }))}
      />
      <div style={s.panel}>
        <div style={s.summary}>
          {run.status === "done" && run.score != null && <CircularScore score={run.score} size={44} />}
          <div style={s.summaryMain}>
            <div style={s.agentName}>{name}</div>
            {failed ? (
              <div style={s.failed}>
                {run.status === "failed" ? t("results.failed") : t("results.cancelled")}
                {" — "}
                {run.error ?? t("results.noError")}
              </div>
            ) : run.status === "running" ? (
              <div style={s.summaryText}>{t("results.running")}</div>
            ) : (
              review?.summary && <div style={s.summaryText}>{review.summary}</div>
            )}
          </div>
          <div style={s.side}>
            <Button type="button" kind="tertiary" size="sm" onClick={() => onViewTrace(run.run_id)}>
              {t("results.viewTrace")}
            </Button>
            <span className="mono tnum" style={s.meta}>
              {formatRunMeta(run)}
            </span>
          </div>
        </div>

        {run.status === "done" &&
          (findings.length === 0 ? (
            <p style={s.note}>{t("results.noFindings")}</p>
          ) : (
            findings.map((f, i) => (
              <FindingCard
                key={f.id}
                f={f}
                defaultExpanded={i === 0}
                pending={action.isPending}
                onAction={(act) => action.mutate({ findingId: f.id, action: act, prId }, { onSuccess: onChanged })}
              />
            ))
          ))}
      </div>
    </div>
  );
}
