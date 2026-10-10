/* AgentPickerPanel — the body of the PR page "Run Review" popover: a checkbox
   row per agent with its "~Ns" estimate, a Clear control, the run button and a
   "Configure agents…" link. Presentational: the selection lives in the parent. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { s } from "./styles";

export function AgentPickerPanel({
  agents,
  checked,
  estimateFor,
  mergedWarning,
  canRun,
  onToggle,
  onClear,
  onRun,
  onNavigate,
}: {
  agents: Agent[];
  checked: ReadonlySet<string>;
  /** Display text of an agent's estimate: "~6s", or "—" when unknown. */
  estimateFor: (agentId: string) => string;
  /** Muted notice for an already merged/closed PR. */
  mergedWarning?: string;
  canRun: boolean;
  onToggle: (agentId: string) => void;
  onClear: () => void;
  onRun: () => void;
  onNavigate: (href: string) => void;
}) {
  const t = useTranslations("prReview");
  const count = agents.filter((a) => checked.has(a.id)).length;

  return (
    <div>
      {mergedWarning && (
        <>
          <div style={s.warn}>
            <Icon.AlertTriangle size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            {mergedWarning}
          </div>
          <div style={s.divider} />
        </>
      )}
      <div style={s.head}>
        <span style={s.title}>{t("runReview.pickAgents")}</span>
        <button type="button" style={s.clear} onClick={onClear}>
          {t("runReview.clear")}
        </button>
      </div>

      {agents.length === 0 ? (
        <button type="button" style={s.muted} onClick={() => onNavigate("/agents")}>
          <Icon.Plus size={14} style={{ flexShrink: 0 }} />
          {t("runReview.noAgents")}
        </button>
      ) : (
        agents.map((a) => (
          <div key={a.id} style={s.row}>
            <Checkbox
              checked={checked.has(a.id)}
              onChange={() => onToggle(a.id)}
              label={
                <span style={s.rowLabel}>
                  <Icon.Cpu size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={s.name}>{a.name}</span>
                  <span className="mono tnum" style={s.estimate}>
                    {estimateFor(a.id)}
                  </span>
                </span>
              }
            />
          </div>
        ))
      )}

      <div style={s.divider} />
      <div style={s.action}>
        <Button type="button" kind="primary" size="md" icon="Users" full disabled={!canRun} onClick={onRun}>
          {t("runReview.runMulti", { count })}
        </Button>
      </div>
      <div style={s.divider} />
      <button type="button" style={s.muted} onClick={() => onNavigate("/agents")}>
        <Icon.Settings size={14} style={{ flexShrink: 0 }} />
        {t("runReview.configureAgents")}
      </button>
    </div>
  );
}
