/* RunReviewDropdown — the PR page "Run Review" trigger and its agent picker.
   Opening checks every enabled agent (set in the open handler, not an effect).
   Running sends ONE POST /pulls/:id/review with `agentIds`: exactly one agent
   stays on this page (its live status streams here); two or more open the
   multi-agent results page. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { defaultSelection, inAgentOrder } from "@/lib/agent-selection";
import { useAgentRunEstimates, useAgents } from "@/lib/hooks/agents";
import { useRunReview } from "@/lib/hooks/reviews";
import { formatSeconds } from "@/lib/run-estimate";
import { AgentPickerPanel } from "./_components/AgentPickerPanel";
import { PANEL_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a single-agent run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agentList } = useAgents();
  const { data: estimates } = useAgentRunEstimates();
  const run = useRunReview();
  const agents = agentList ?? [];

  const [open, setOpen] = React.useState(false);
  // The user's explicit selection while open; null → the derived default.
  const [picked, setPicked] = React.useState<string[] | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectedIds = picked ?? defaultSelection(agents);
  const checked = new Set(selectedIds);
  const agentIds = inAgentOrder(agents, selectedIds);
  const estimateByAgent = new Map((estimates ?? []).map((e) => [e.agent_id, e.avg_duration_ms]));

  // Outside click closes the popover (a DOM listener: an external system).
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggleOpen = () => {
    if (!open) setPicked(null);
    setOpen((o) => !o);
  };
  const toggle = (id: string) => setPicked(checked.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const estimateFor = (id: string) => {
    const ms = estimateByAgent.get(id);
    return ms == null ? "—" : t("runReview.estimate", { duration: formatSeconds(ms, 0) });
  };

  const kick = async () => {
    const single = agentIds.length === 1;
    setOpen(false);
    if (single) onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, agentIds });
      if (single) onRunsStarted?.(res.runs.map((r) => r.run_id));
      else if (res.multi_agent_run_id) router.push(`/multi-agent/${res.multi_agent_run_id}`);
    } catch {
      // A failed request already raised the global error toast.
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <div ref={rootRef} style={s.root}>
      <span
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind={kind}
          size={size}
          iconRight="ChevronDown"
          icon="Sparkles"
          loading={run.isPending}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={toggleOpen}
        >
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div style={s.popover(PANEL_WIDTH)}>
          <AgentPickerPanel
            agents={agents}
            checked={checked}
            estimateFor={estimateFor}
            mergedWarning={warnMerged ? t("runReview.mergedWarning") : undefined}
            canRun={agentIds.length > 0 && !run.isPending}
            onToggle={toggle}
            onClear={() => setPicked([])}
            onRun={() => void kick()}
            onNavigate={(href) => {
              setOpen(false);
              router.push(href);
            }}
          />
        </div>
      )}
    </div>
  );
}
