"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiVerdict } from "@devdigest/shared";

const TONE: Record<CiVerdict, { color: string; bg: string }> = {
  passed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  changes_requested: { color: "var(--warn)", bg: "var(--warn-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

/** A CI run's verdict as a dot + label (CI tab rows and the CI Runs table). */
export function CiVerdictBadge({ verdict }: { verdict: CiVerdict }) {
  const t = useTranslations("ci.runs.verdict");
  return (
    <Badge dot color={TONE[verdict].color} bg={TONE[verdict].bg}>
      {t(verdict)}
    </Badge>
  );
}
