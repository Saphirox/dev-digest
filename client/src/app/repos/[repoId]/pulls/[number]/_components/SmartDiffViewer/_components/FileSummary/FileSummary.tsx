/* FileSummary — the PR Brief's one-line "what this does" for a changed file:
   a `✦ summary` chip beside the path and the line itself at the top of the
   open card. Model text renders as plain JSX text only. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function SummaryChip() {
  const t = useTranslations("prReview");
  return (
    <span role="img" aria-label={t("smartDiff.summaryChipLabel")} style={s.chip}>
      <Icon.Sparkles size={11} />
      {t("smartDiff.summaryChip")}
    </span>
  );
}

export function SummaryLine({ summary }: { summary: string }) {
  const t = useTranslations("prReview");
  return (
    <div style={s.line}>
      <Icon.Sparkles size={13} style={s.lineIcon} />
      <span>
        <strong style={s.label}>{t("smartDiff.whatThisDoes")}</strong> {summary}
      </span>
    </div>
  );
}
