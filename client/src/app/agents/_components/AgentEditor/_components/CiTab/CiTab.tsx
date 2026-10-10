/* CiTab — where this agent runs in CI: the repositories it was exported to, each
   with its exported version and latest CI verdict; "Add to CI" opens the export
   wizard; "Fail CI on" saves the agent's CI gate policy. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, FormField, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { CiVerdictBadge } from "@/components/ci-verdict-badge/CiVerdictBadge";
import { useCiInstallations } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { CI_FAIL_ON_VALUES } from "../../constants";
import { ExportCiWizard } from "../ExportCiWizard";
import { relativeTime } from "./helpers";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const ta = useTranslations("agents");
  const installations = useCiInstallations(agent.id);
  const update = useUpdateAgent();
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const rows = installations.data ?? [];
  const failOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));

  return (
    <div style={s.wrap}>
      {wizardOpen && <ExportCiWizard agent={agent} onClose={() => setWizardOpen(false)} />}
      <div style={s.header}>
        <h2 style={s.h2}>{t("heading")}</h2>
        {installations.data && rows.length > 0 && (
          <Badge dot color="var(--ok)" bg="var(--ok-bg)">
            {t("active", { count: rows.length })}
          </Badge>
        )}
        <span style={s.spacer} />
        <Button type="button" kind="primary" icon="Plus" onClick={() => setWizardOpen(true)}>
          {t("addToCi")}
        </Button>
      </div>

      {installations.isLoading && <Skeleton height={60} />}
      {installations.isError && <ErrorState title={t("loadError")} onRetry={() => void installations.refetch()} />}
      {installations.data && rows.length === 0 && <p style={s.muted}>{t("empty")}</p>}
      {rows.length > 0 && (
        <ul style={s.list}>
          {rows.map((r) => (
            <InstallationRow key={r.id} installation={r} />
          ))}
        </ul>
      )}
      {installations.data && rows.length > 0 && (
        <button type="button" style={s.add} onClick={() => setWizardOpen(true)}>
          <Icon.Plus size={14} aria-hidden="true" />
          {t("addRepo")}
        </button>
      )}

      <div style={s.failOn}>
        <FormField label={t("failOnLabel")} hint={t("failOnHint")}>
          <SelectInput
            value={agent.ci_fail_on}
            onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
            options={failOnOptions}
          />
        </FormField>
      </div>
    </div>
  );
}

function InstallationRow({ installation }: { installation: CiInstallation }) {
  const t = useTranslations("ci.ciTab");
  const run = installation.latest_run;
  const ago = run?.ran_at ? relativeTime(run.ran_at) : null;
  return (
    <li style={s.row}>
      <Icon.GitBranch size={16} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
      <span className="mono" style={s.repo}>
        {installation.repo}
      </span>
      <Badge>{t("ghaChip")}</Badge>
      {installation.agent_version != null && (
        <span className="mono" style={s.muted}>
          v{installation.agent_version}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {run ? (
        <>
          <CiVerdictBadge verdict={run.verdict} />
          {ago && <span style={s.muted}>{t(`ago.${ago.unit}`, { n: ago.n })}</span>}
        </>
      ) : (
        <span style={s.muted}>{t("noRuns")}</span>
      )}
      <Link href="/ci-runs" style={{ fontSize: 13 }}>
        {t("viewRuns")}
      </Link>
    </li>
  );
}
