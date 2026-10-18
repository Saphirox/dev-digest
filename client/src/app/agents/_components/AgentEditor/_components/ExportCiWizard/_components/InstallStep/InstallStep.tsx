"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { isGithubUrl } from "@/lib/github-urls";
import type { CiAction } from "../../constants";
import type { ExportCiWizardState } from "../../useExportCiWizard";
import { s } from "../../styles";

/** Step 4 — open a PR or download a zip; install failures are shown inline. */
export function InstallStep({ wizard }: { wizard: ExportCiWizardState }) {
  const t = useTranslations("ci.exportWizard");

  if (wizard.installed) {
    return wizard.action === "open_pr" ? (
      <div role="status" style={s.cardBody}>
        <strong>{t("installStep.doneTitle")}</strong>
        <div>
          {isGithubUrl(wizard.prUrl) ? (
            <a href={wizard.prUrl} target="_blank" rel="noopener noreferrer">
              {t("installStep.viewPr")}
            </a>
          ) : (
            t("installStep.doneNoLink")
          )}
        </div>
      </div>
    ) : (
      <p role="status" style={s.cardBody}>
        {t("installStep.zipDone")}
      </p>
    );
  }

  const choose = (action: CiAction) => wizard.setAction(action);
  return (
    <>
      <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          role="radio"
          aria-checked={wizard.action === "open_pr"}
          style={s.card(wizard.action === "open_pr")}
          onClick={() => choose("open_pr")}
        >
          <span style={s.cardHead}>
            <Icon.GitBranch size={16} aria-hidden="true" />
            {t("installStep.prTitle")}
            <span style={s.spacerInline}>
              <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                {t("recommended")}
              </Badge>
            </span>
          </span>
          <span style={s.cardBody}>
            {t("installStep.prBody", { repo: wizard.repo ?? "—", count: wizard.files.length })}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={wizard.action === "files"}
          style={s.card(wizard.action === "files")}
          onClick={() => choose("files")}
        >
          <span style={s.cardHead}>
            <Icon.Copy size={16} aria-hidden="true" />
            {t("installStep.zipTitle")}
            <span style={{ ...s.spacerInline, ...s.hint, fontWeight: 400 }}>{t("installStep.zipHint")}</span>
          </span>
        </button>
      </div>
      {!wizard.repo && <p style={s.warn}>{t("installStep.noRepo")}</p>}
      {wizard.installError && <InstallError error={wizard.installError} repo={wizard.repo} />}
    </>
  );
}

function InstallError({ error, repo }: { error: Error; repo: string | null }) {
  const t = useTranslations("ci.exportWizard");
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "github_not_configured") {
    return (
      <p role="alert" style={s.error}>
        {t("installStep.notConfigured")} <Link href="/settings/api-keys">{t("installStep.openSettings")}</Link>
      </p>
    );
  }
  if (code === "github_workflow_permission") {
    return (
      <p role="alert" style={s.error}>
        {t("installStep.workflowPermission")}
      </p>
    );
  }
  const agent = error instanceof ApiError ? agentNameOf(error.details) : null;
  if (code === "ci_repo_taken" && repo && agent) {
    return (
      <p role="alert" style={s.error}>
        {t("installStep.repoTaken", { repo, agent })}
      </p>
    );
  }
  return (
    <p role="alert" style={s.error}>
      {error.message}
    </p>
  );
}

function agentNameOf(details: unknown): string | null {
  const name = (details as { agent_name?: unknown } | null | undefined)?.agent_name;
  return typeof name === "string" ? name : null;
}
