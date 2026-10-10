/* EvalCaseRow — one case in the Evals tab: pass / fail / never run (icon + word),
   name, "expected N, got M" from its latest result, the expectation type and
   severity · category, and run / edit / delete controls. No source-finding link:
   the case outlives its finding (EC-24). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { s } from "./styles";

export function EvalCaseRow({
  evalCase,
  runDisabled,
  running,
  onRun,
  onEdit,
  onDelete,
}: {
  evalCase: EvalCase;
  /** A suite run is in progress for this agent (EC-8): single-case runs would 409. */
  runDisabled: boolean;
  /** This case's own run is in flight. */
  running: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const r = evalCase.latest_result;
  const StatusIcon = r ? (r.pass ? Icon.CheckCircle : Icon.XCircle) : Icon.Dot;
  const statusColor = r ? (r.pass ? "var(--ok)" : "var(--crit)") : "var(--text-muted)";
  const statusText = r ? (r.pass ? t("evalsTab.passed") : t("evalsTab.failed")) : t("evalsTab.neverRun");
  const labels = [evalCase.severity, evalCase.category].filter(Boolean).join(" · ");
  const name = evalCase.name;

  return (
    <li style={s.row} data-testid={`eval-case-${evalCase.id}`}>
      <span style={s.status(statusColor)}>
        <StatusIcon size={16} aria-hidden="true" />
        {statusText}
      </span>
      <div style={s.main}>
        <div className="mono" style={s.name}>
          {name}
        </div>
        <div style={s.sub}>
          {r
            ? t("evalsTab.expectedGot", { expected: r.expected_count, produced: r.produced_count })
            : t("evalsTab.neverRun")}
        </div>
      </div>
      <div style={s.tags}>
        <Badge mono>{t(`kind.${evalCase.expected_output.kind}`)}</Badge>
        {labels && <span style={s.label}>{labels}</span>}
      </div>
      <div style={s.actions}>
        <Button
          type="button"
          kind="tertiary"
          size="sm"
          icon="Play"
          aria-label={t("evalsTab.runCase", { name })}
          title={t("evalsTab.runCase", { name })}
          loading={running}
          disabled={runDisabled}
          onClick={onRun}
        />
        <Button
          type="button"
          kind="tertiary"
          size="sm"
          icon="Edit"
          aria-label={t("evalsTab.editCase", { name })}
          title={t("evalsTab.editCase", { name })}
          onClick={onEdit}
        />
        <Button
          type="button"
          kind="tertiary"
          size="sm"
          icon="Trash"
          aria-label={t("evalsTab.deleteCase", { name })}
          title={t("evalsTab.deleteCase", { name })}
          onClick={onDelete}
        />
      </div>
    </li>
  );
}
