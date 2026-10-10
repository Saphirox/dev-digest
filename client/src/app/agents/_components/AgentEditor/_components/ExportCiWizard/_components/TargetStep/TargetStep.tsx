"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { s } from "../../styles";

/** Step 1 — the only target is GitHub Actions (CircleCI, Jenkins, CLI are hidden). */
export function TargetStep() {
  const t = useTranslations("ci.exportWizard");
  return (
    <div style={s.card(true)}>
      <div style={s.cardHead}>
        <Icon.Workflow size={18} aria-hidden="true" />
        {t("target.gha")}
        <span style={s.spacerInline}>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {t("recommended")}
          </Badge>
        </span>
      </div>
      <div style={s.cardBody}>{t("target.ghaDesc")}</div>
    </div>
  );
}
