/* ConfigureRun — /multi-agent/configure: pick a PR, check the agents to fan
   out, and start ONE multi-agent run. Choosing a PR resets the selection in
   its handler; until the user changes it (toggle, Select all) the checked set
   is the derived default — every enabled agent. That default also covers a
   `?pr=` prefill, which has no handler to run. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SelectInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { defaultSelection, inAgentOrder } from "@/lib/agent-selection";
import { useAgentRunEstimates, useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { usePrReviews, useRunReview } from "@/lib/hooks/reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { footerEstimate, formatEstimate, formatSeconds } from "@/lib/run-estimate";
import { formatUsd } from "@/lib/format-usd";
import { AgentCard } from "./_components/AgentCard";
import { agentSummary, selectablePulls } from "./helpers";
import { s } from "./styles";

export function ConfigureRun() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const { data: pulls } = usePulls(activeRepo?.id);
  const { data: agentList } = useAgents();
  const { data: estimates } = useAgentRunEstimates();
  const run = useRunReview();
  const agents = agentList ?? [];

  const [prId, setPrId] = React.useState(search.get("pr") ?? "");
  // The user's explicit selection; null → the derived default.
  const [picked, setPicked] = React.useState<string[] | null>(null);
  const selectedIds = picked ?? defaultSelection(agents);
  const selected = new Set(selectedIds);

  const { data: reviews } = usePrReviews(prId || null);
  const estimateByAgent = new Map((estimates ?? []).map((e) => [e.agent_id, e]));
  const pr = (pulls ?? []).find((p) => p.id === prId);
  const options = selectablePulls(pulls ?? [], prId).map((p) => ({ value: p.id, label: `#${p.number} · ${p.title}` }));

  const choosePr = (id: string) => {
    setPrId(id);
    setPicked(null);
  };
  const toggle = (id: string) => setPicked(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const agentIds = inAgentOrder(agents, selectedIds);
  const checkedEstimates = agentIds.flatMap((id) => estimateByAgent.get(id) ?? []);
  const total = footerEstimate(checkedEstimates);
  const canRun = !!prId && agentIds.length > 0 && !run.isPending;

  const start = () =>
    run.mutate(
      { prId, agentIds },
      {
        onSuccess: (res) => {
          if (res.multi_agent_run_id) router.push(`/multi-agent/${res.multi_agent_run_id}`);
          // A single checked agent is a plain single-agent review: it has no results page.
          else if (activeRepo && pr) router.push(`/repos/${activeRepo.id}/pulls/${pr.number}?tab=findings`);
        },
      },
    );

  return (
    <AppShell crumb={[{ label: t("crumb.root"), href: "/multi-agent" }, { label: t("crumb.configure") }]}>
      <div style={s.page}>
        <h1 style={s.title}>{t("configure.title")}</h1>
        <p style={s.intro}>{t("configure.intro")}</p>

        <div style={s.step}>
          <span style={s.stepNum(true)}>1</span>
          <span style={s.stepLabel(true)}>{t("configure.stepPr")}</span>
        </div>
        <div style={{ ...s.indent, ...s.selectWrap }}>
          <SelectInput
            mono={false}
            value={prId}
            onChange={choosePr}
            options={[{ value: "", label: t("configure.prPlaceholder") }, ...options]}
          />
        </div>

        <div style={s.step}>
          <span style={s.stepNum(!!prId)}>2</span>
          <span style={s.stepLabel(!!prId)}>{t("configure.stepAgents")}</span>
          {!!prId && agents.length > 0 && (
            <Button
              type="button"
              kind="tertiary"
              size="sm"
              style={s.selectAll}
              onClick={() => setPicked(agents.map((a) => a.id))}
            >
              {t("configure.selectAll")}
            </Button>
          )}
        </div>
        <div style={s.indent}>
          {!prId ? (
            <EmptyState icon="GitPullRequest" title={t("configure.pickPrFirst")} body={t("configure.pickPrBody")} />
          ) : agents.length === 0 ? (
            <Link href="/agents" style={s.hintLink}>
              {t("configure.noAgents")}
            </Link>
          ) : (
            <>
              <div style={s.list}>
                {agents.map((a) => (
                  <AgentCard
                    key={a.id}
                    name={a.name}
                    summary={agentSummary(a, reviews)}
                    estimate={formatEstimate(estimateByAgent.get(a.id))}
                    checked={selected.has(a.id)}
                    onToggle={() => toggle(a.id)}
                  />
                ))}
              </div>
              {agentIds.length === 0 && <p style={s.hint}>{t("configure.pickAtLeastOne")}</p>}
            </>
          )}
        </div>

        <div style={s.footer}>
          <Button type="button" kind="primary" icon="Users" disabled={!canRun} loading={run.isPending} onClick={start}>
            {run.isPending ? t("configure.starting") : t("configure.run", { count: prId ? agentIds.length : 0 })}
          </Button>
          {prId && agentIds.length > 0 && (
            <span className="mono" style={s.estimate}>
              {t("configure.footer", {
                duration: formatSeconds(total.durationMs),
                cost: formatUsd(total.costUsd),
              })}
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}
