/* RunStatusLabel — a suite run's status as icon + word: running, done or
   failed. Colour is only a twin of the text (NFR-6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalSuiteRunStatus } from "@devdigest/shared";
import { s } from "./styles";

const LOOK = {
  running: { icon: Icon.RefreshCw, color: "var(--accent)" },
  done: { icon: Icon.CheckCircle, color: "var(--ok)" },
  failed: { icon: Icon.XCircle, color: "var(--crit)" },
} as const;

export function RunStatusLabel({ status }: { status: EvalSuiteRunStatus }) {
  const t = useTranslations("eval");
  const { icon: I, color } = LOOK[status];
  return (
    <span style={s.status(color)} data-status={status}>
      <I size={13} aria-hidden="true" style={status === "running" ? { animation: "ddspin 1s linear infinite" } : undefined} />
      {t(`status.${status}`)}
    </span>
  );
}
