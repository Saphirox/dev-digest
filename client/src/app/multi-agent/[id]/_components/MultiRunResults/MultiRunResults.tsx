/* MultiRunResults — /multi-agent/:id. Header (counts, PR, Columns/Tabs toggle,
   wall clock, summed known cost), the agents as Columns or Tabs, the
   disagreement block and the run trace drawer (`?trace=<runId>`). The mode is
   local state and starts on Columns. Unknown duration or cost is "—". */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { formatUsd } from "@/lib/format-usd";
import { useMultiRun } from "@/lib/hooks/reviews";
import { formatSeconds, sumKnown, wallClockMs } from "@/lib/run-estimate";
import { AgentColumn } from "../AgentColumn";
import { AgentTabs } from "../AgentTabs";
import { DisagreementBlock } from "../DisagreementBlock";
import { s } from "./styles";

type Mode = "columns" | "tabs";
const MODES: Mode[] = ["columns", "tabs"];

export function MultiRunResults({ id }: { id: string }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const { data, isLoading, isError, refetch } = useMultiRun(id);
  const [mode, setMode] = React.useState<Mode>("columns");
  const traceRunId = search.get("trace");

  const setTrace = (runId: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (runId) sp.set("trace", runId);
    else sp.delete("trace");
    router.replace(`/multi-agent/${id}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };
  // Stable identity: a child's stream-end effect depends on it.
  const refresh = React.useCallback(() => void refetch(), [refetch]);

  const crumb = [
    { label: t("crumb.root"), href: "/multi-agent" },
    ...(data ? [{ label: `#${data.pr_number}`, mono: true }] : []),
  ];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loading}>
          <Skeleton height={28} width={420} />
          <Skeleton height={240} />
        </div>
      </AppShell>
    );
  }
  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("results.loadError")} onRetry={refresh} />
      </AppShell>
    );
  }

  const { runs, reviews } = data;
  const reviewOf = (runId: string) => reviews.find((r) => r.run_id === runId);
  const traceRun = traceRunId ? runs.find((r) => r.run_id === traceRunId) : undefined;
  const totals = t("results.totals", {
    count: runs.length,
    duration: formatSeconds(wallClockMs(data.ran_at, runs)),
    cost: formatUsd(sumKnown(runs.map((r) => r.cost_usd))),
  });

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <Button
            type="button"
            kind="secondary"
            size="sm"
            icon="Settings"
            onClick={() => router.push(`/multi-agent/configure?pr=${data.pr_id}`)}
          >
            {t("results.configureRun")}
          </Button>
          <h1 style={s.title}>{t("results.title")}</h1>
          <span style={s.sub}>{t("results.selectedAgents", { count: runs.length })}</span>
          <div role="group" aria-label={t("results.viewMode")} style={s.toggle}>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                style={s.toggleBtn(mode === m)}
                onClick={() => setMode(m)}
              >
                {t(m === "columns" ? "results.modeColumns" : "results.modeTabs")}
              </button>
            ))}
          </div>
        </div>

        <div style={s.prRow}>
          <span className="mono" style={s.prNumber}>
            #{data.pr_number}
          </span>
          <span style={s.prTitle}>{data.pr_title}</span>
          <span style={s.totals}>
            <Icon.Cpu size={14} style={{ color: "var(--accent)" }} />
            {totals}
          </span>
        </div>

        {mode === "columns" ? (
          <div style={s.columns(runs.length)}>
            {runs.map((r) => (
              <AgentColumn
                key={r.run_id}
                run={r}
                review={reviewOf(r.run_id)}
                onViewTrace={setTrace}
                onStreamEnd={refresh}
              />
            ))}
          </div>
        ) : (
          <AgentTabs prId={data.pr_id} runs={runs} reviews={reviews} onViewTrace={setTrace} onChanged={refresh} />
        )}

        <DisagreementBlock runs={runs} reviews={reviews} groups={data.groups} />
      </div>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={data.pr_number}
          agentName={traceRun?.agent_name ?? null}
          findings={reviewOf(traceRunId)?.findings ?? []}
          running={traceRun?.status === "running"}
          awaitTrace
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
