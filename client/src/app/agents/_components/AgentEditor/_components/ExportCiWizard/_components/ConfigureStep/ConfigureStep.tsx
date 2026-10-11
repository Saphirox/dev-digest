"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, Icon } from "@devdigest/ui";
import { POST_AS_VALUES, TRIGGERS } from "../../constants";
import type { ExportCiWizardState } from "../../useExportCiWizard";
import { s } from "../../styles";

/** Step 3 — triggers, expected secrets (static hints), post-as and the merge-blocking note. */
export function ConfigureStep({ wizard }: { wizard: ExportCiWizardState }) {
  const t = useTranslations("ci.exportWizard");
  return (
    <>
      <div>
        <div style={s.label}>{t("configure.triggerLabel")}</div>
        <div style={{ ...s.row, marginTop: 8 }}>
          {TRIGGERS.map((tr) => (
            <Chip
              key={tr}
              icon={wizard.triggers.includes(tr) ? "Check" : undefined}
              active={wizard.triggers.includes(tr)}
              onClick={() => wizard.toggleTrigger(tr)}
            >
              {`pull_request:${tr}`}
            </Chip>
          ))}
        </div>
        {wizard.triggers.length === 0 && (
          <p role="alert" style={{ ...s.warn, marginTop: 8 }}>
            {t("configure.noTrigger")}
          </p>
        )}
      </div>

      <div>
        <div style={s.label}>{t("configure.secretsLabel")}</div>
        <table style={{ ...s.table, marginTop: 8 }}>
          <tbody>
            <tr>
              <td className="mono" style={s.td}>
                OPENROUTER_API_KEY
              </td>
              <td style={{ ...s.td, color: "var(--text-secondary)" }}>{t("configure.openrouterHint")}</td>
              <td style={s.td}>
                <Badge color="var(--warn)" bg="var(--bg-hover)" dot>
                  {t("configure.secretRequired")}
                </Badge>
              </td>
            </tr>
            <tr>
              <td className="mono" style={s.td}>
                GITHUB_TOKEN
              </td>
              <td style={{ ...s.td, color: "var(--text-secondary)" }}>{t("configure.githubTokenHint")}</td>
              <td style={s.td}>
                <Badge color="var(--ok)" bg="var(--bg-hover)" dot>
                  {t("configure.secretAuto")}
                </Badge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div role="radiogroup" aria-label={t("configure.postResultsLabel")}>
        <div style={s.label}>{t("configure.postResultsLabel")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {POST_AS_VALUES.map((v) => (
            <label key={v} style={s.radio}>
              <input
                type="radio"
                name="ci-post-as"
                checked={wizard.postAs === v}
                onChange={() => wizard.setPostAs(v)}
              />
              {t(`configure.postAs.${v}`)}
              {v === "github_review" && (
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                  {t("recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </div>

      {wizard.replaced && (
        <p role="status" style={s.warn}>
          {t("workflowReplaced")}
        </p>
      )}

      <div style={{ ...s.note, display: "flex", gap: 10 }}>
        <Icon.Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{t("configure.blockMerges")}</span>
      </div>
    </>
  );
}
