/* CompareRunsModal — two done runs side by side: for recall, precision,
   citation accuracy and cost the older value, the newer value and the signed
   change; a line diff of the two saved effective prompts (or a note when they
   are the same); model / provider when they differ; and "Promote vN" for each
   run's version, which restores that version's saved config as a new version.
   Promote is off, with the reason shown, for the current version (EC-16) and a
   version without a snapshot (EC-25). Escape or Close leaves, and focus returns
   to where it was (NFR-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { AgentVersion, EvalMetricName, EvalSuiteRun } from "@devdigest/shared";
import { TextDiff } from "@/components/text-diff";
import {
  DeltaChip,
  METRIC_COLOR,
  formatCostDelta,
  formatDelta,
  formatPct,
  metricChange,
} from "@/components/eval-metrics";
import { formatUsd } from "@/lib/format-usd";
import { notify } from "@/lib/toast";
import { useEvalRun } from "@/lib/hooks/evals";
import { usePromoteVersion } from "@/lib/hooks/agents";
import { promoteBlock } from "../../helpers";
import { s } from "./styles";

const METRICS: { key: EvalMetricName; label: "recall" | "precision" | "citation" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citation" },
];

export function CompareRunsModal({
  agentId,
  older,
  newer,
  currentVersion,
  versions,
  onClose,
}: {
  agentId: string;
  older: EvalSuiteRun;
  newer: EvalSuiteRun;
  /** The agent's latest version number; null until the agent has loaded. */
  currentVersion: number | null;
  /** Saved snapshots; undefined while loading. */
  versions: AgentVersion[] | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const oldRun = useEvalRun(older.id);
  const newRun = useEvalRun(newer.id);
  const promote = usePromoteVersion(agentId);
  const root = React.useRef<HTMLDivElement>(null);
  const snapshots = versions?.map((v) => v.version);

  // Keyboard: focus lands on Close, Escape closes, and focus goes back afterwards.
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
    // Mount / unmount only: `onClose` is the page's state setter, stable enough for a one-shot listener.
  }, []);

  const costDelta = formatCostDelta(older.cost_usd, newer.cost_usd, formatUsd);
  const loading = oldRun.isLoading || newRun.isLoading;
  const failed = oldRun.isError || newRun.isError;
  const oldPrompt = oldRun.data?.effective_prompt;
  const newPrompt = newRun.data?.effective_prompt;

  const doPromote = (version: number) =>
    promote.mutate(version, {
      onSuccess: (agent) => {
        notify.success(t("compare.promoted", { from: version, version: agent.version }));
        onClose();
      },
    });

  return (
    <div ref={root}>
      <Modal
        width={880}
        title={t("compare.title", { from: older.agent_version, to: newer.agent_version })}
        subtitle={t("compare.subtitle")}
        onClose={onClose}
      >
        <div style={s.body}>
          <div style={s.tiles}>
            {METRICS.map((m) => {
              const d = formatDelta(metricChange(older[m.key], newer[m.key]));
              const label = t(`legend.${m.label}`);
              return (
                <div key={m.key} style={s.tile} data-testid={`compare-${m.key}`}>
                  <div style={s.tileLabel}>{label}</div>
                  <div style={s.tileRow}>
                    <span className="tnum" style={s.old}>
                      {formatPct(older[m.key])}
                    </span>
                    <Icon.ArrowRight size={13} aria-hidden="true" style={s.arrow} />
                    <span className="tnum" style={s.newValue(METRIC_COLOR[m.key], newer[m.key] != null)}>
                      {formatPct(newer[m.key])}
                    </span>
                    {d && <DeltaChip name={t(`delta.${d.direction}`, { label, points: d.points })} text={d.text} direction={d.direction} />}
                  </div>
                </div>
              );
            })}
            <div style={s.tile} data-testid="compare-cost">
              <div style={s.tileLabel}>{t("table.cost")}</div>
              <div style={s.tileRow}>
                <span className="tnum" style={s.old}>
                  {formatUsd(older.cost_usd)}
                </span>
                <Icon.ArrowRight size={13} aria-hidden="true" style={s.arrow} />
                <span className="tnum" style={s.newValue("var(--text-primary)", newer.cost_usd != null)}>
                  {formatUsd(newer.cost_usd)}
                </span>
                {costDelta && (
                  <DeltaChip
                    neutral
                    name={t(`delta.cost${costDelta.direction === "up" ? "Up" : costDelta.direction === "down" ? "Down" : "Flat"}`, {
                      label: t("table.cost"),
                      amount: costDelta.amount,
                    })}
                    text={costDelta.text}
                    direction={costDelta.direction}
                  />
                )}
              </div>
            </div>
          </div>

          {(older.model !== newer.model || older.provider !== newer.provider) && (
            <div style={s.changes}>
              {older.model !== newer.model && (
                <span>{t("compare.modelChanged", { from: older.model, to: newer.model })}</span>
              )}
              {older.provider !== newer.provider && (
                <span>{t("compare.providerChanged", { from: older.provider, to: newer.provider })}</span>
              )}
            </div>
          )}

          <div>
            <div style={s.tileLabel}>{t("compare.promptHeading")}</div>
            <div style={{ ...s.diffBox, marginTop: 10 }}>
              {loading && <Skeleton height={80} />}
              {failed && <div style={s.error}>{t("compare.loadError")}</div>}
              {oldPrompt !== undefined && newPrompt !== undefined &&
                (oldPrompt === newPrompt ? (
                  <div style={s.same}>{t("compare.promptUnchanged")}</div>
                ) : (
                  <TextDiff
                    from={oldPrompt}
                    to={newPrompt}
                    head={t("compare.diffHead", { from: older.agent_version, to: newer.agent_version })}
                    label={t("compare.promptHeading")}
                    sameLabel={t("compare.promptUnchanged")}
                  />
                ))}
            </div>
          </div>

          {promote.isError && (
            <div role="alert" style={s.error}>
              {promote.error.message}
            </div>
          )}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", background: "var(--bg-surface)" }}>
          <div style={s.footer}>
            <Button type="button" kind="secondary" style={s.close} onClick={onClose} data-autofocus>
              {t("compare.close")}
            </Button>
            {[...new Set([older.agent_version, newer.agent_version])].map((v, i) => {
              const block = promoteBlock(v, currentVersion, snapshots);
              const why = block === "current" ? t("compare.alreadyCurrent", { version: v }) : block === "noSnapshot" ? t("compare.noSnapshot", { version: v }) : null;
              return (
                <div key={v} style={s.promote}>
                  <Button
                    type="button"
                    kind="primary"
                    icon="GitBranch"
                    disabled={block !== null}
                    loading={promote.isPending && promote.variables === v}
                    aria-describedby={why ? `promote-why-${i}` : undefined}
                    onClick={() => doPromote(v)}
                  >
                    {t("compare.promote", { version: v })}
                  </Button>
                  {why && (
                    <span id={`promote-why-${i}`} style={s.why}>
                      {why}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
