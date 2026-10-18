/* CiRunsView — /ci-runs: a plain table of the CI runs ingested from GitHub
   Actions, newest first. Opening the page and "Refresh" pull the latest results
   from GitHub first; when that fails the stored runs stay visible with a notice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { CiVerdictBadge } from "@/components/ci-verdict-badge/CiVerdictBadge";
import { NO_VALUE } from "@/components/eval-metrics";
import { formatUsd } from "@/lib/format-usd";
import { githubPrUrl, isGithubUrl } from "@/lib/github-urls";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { formatDuration } from "./helpers";
import { s } from "./styles";

const COLUMNS = ["repo", "pr", "agent", "verdict", "findings", "cost", "duration", "job"] as const;

export function CiRunsView() {
  const t = useTranslations("ci.runs");
  const runs = useCiRuns();
  const refresh = useRefreshCiRuns();
  const { mutate: refreshRuns } = refresh;

  // Refresh once when the page opens (the ref survives StrictMode's double effect).
  const refreshed = React.useRef(false);
  React.useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    refreshRuns();
  }, [refreshRuns]);

  const failedRepos = refresh.data?.failed_repos ?? [];
  const list = runs.data ?? [];
  const crumb = [{ label: t("crumbLab") }, { label: t("title") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.headActions}>
            <Button type="button" icon="RefreshCw" loading={refresh.isPending} onClick={() => refreshRuns()}>
              {refresh.isPending ? t("refreshing") : t("refresh")}
            </Button>
          </div>
        </div>

        {refresh.isError && (
          <p role="alert" style={s.notice}>
            {t("refreshFailed")}
          </p>
        )}
        {failedRepos.length > 0 && (
          <p role="alert" style={s.notice}>
            {t("refreshFailedRepos", { repos: failedRepos.join(", ") })}
          </p>
        )}

        {runs.isLoading && <Skeleton height={140} />}
        {runs.isError && <ErrorState title={t("loadError")} onRetry={() => void runs.refetch()} />}
        {runs.data &&
          (list.length === 0 ? (
            <EmptyState icon="Workflow" title={t("emptyTitle")} body={t("emptyBody")} />
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} style={s.th} scope="col">
                        {t(`table.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <RunRow key={r.id} run={r} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </AppShell>
  );
}

function RunRow({ run }: { run: CiRun }) {
  const t = useTranslations("ci.runs");
  return (
    <tr>
      <td className="mono" style={s.td}>
        {run.repo ?? NO_VALUE}
      </td>
      <td className="mono" style={s.td}>
        {run.repo && run.pr_number != null ? (
          <a href={githubPrUrl(run.repo, run.pr_number)} target="_blank" rel="noopener noreferrer">
            #{run.pr_number}
          </a>
        ) : (
          NO_VALUE
        )}
      </td>
      <td style={s.td}>{run.agent_name ?? NO_VALUE}</td>
      <td style={s.td}>
        <CiVerdictBadge verdict={run.verdict} />
      </td>
      <td className="tnum" style={s.td}>
        {run.findings_count ?? NO_VALUE}
      </td>
      <td className="tnum" style={s.td}>
        {formatUsd(run.cost_usd)}
      </td>
      <td className="tnum" style={s.td}>
        {formatDuration(run.duration_ms)}
      </td>
      <td style={s.td}>
        {isGithubUrl(run.job_url) ? (
          <a href={run.job_url} target="_blank" rel="noopener noreferrer">
            {t("viewJob")}
          </a>
        ) : (
          NO_VALUE
        )}
      </td>
    </tr>
  );
}
