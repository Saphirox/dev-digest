"use client";

import React from "react";
import type { Agent, CiExportInputBody, CiTrigger } from "@devdigest/shared";
import { useCiPreview, useExportCi, useExportCiZip } from "@/lib/hooks/ci";
import { useActiveRepo } from "@/lib/repo-context";
import {
  DEFAULT_TRIGGERS,
  STEP_KEYS,
  ZIP_FILENAME,
  type CiAction,
  type CiPostAs,
} from "./constants";
import { saveBlob, toggleTrigger } from "./helpers";

/**
 * State of the Export-to-CI wizard: the current step, the Configure choices,
 * the generated files (the preview mutation's data — not copied into state) and
 * the user's edit of the workflow file. Changing a Configure choice regenerates
 * the files and discards the workflow edit (AC-20).
 */
export function useExportCiWizard(agent: Agent) {
  const { activeRepo } = useActiveRepo();
  const preview = useCiPreview(agent.id);
  const exportPr = useExportCi(agent.id);
  const exportZip = useExportCiZip(agent.id);

  const [step, setStep] = React.useState(0);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>([...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<CiPostAs>("github_review");
  const [action, setAction] = React.useState<CiAction>("open_pr");
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [editedWorkflow, setEditedWorkflow] = React.useState<string | null>(null);
  const [replaced, setReplaced] = React.useState(false);

  const files = preview.data?.files ?? [];
  // The server marks the one editable file (the workflow) — no path is hard-coded here.
  const workflowFile = files.find((f) => f.editable);
  const selected = files.find((f) => f.path === selectedPath) ?? workflowFile ?? files[0];
  const workflowText = editedWorkflow ?? workflowFile?.contents ?? "";

  const generate = (nextTriggers: CiTrigger[], nextPostAs: CiPostAs) => {
    if (nextTriggers.length === 0) return;
    preview.mutate({ triggers: nextTriggers, post_as: nextPostAs });
  };

  /** A Configure choice changed: regenerate and drop the earlier workflow edit. */
  const changeChoices = (nextTriggers: CiTrigger[], nextPostAs: CiPostAs) => {
    setTriggers(nextTriggers);
    setPostAs(nextPostAs);
    if (editedWorkflow != null) {
      setEditedWorkflow(null);
      setReplaced(true);
    }
    generate(nextTriggers, nextPostAs);
  };

  const editWorkflow = (text: string) => {
    setEditedWorkflow(text);
    setReplaced(false);
  };

  const goTo = (next: number) => {
    // Entering Preview from Target (re)generates the files with the current choices.
    if (next === 1 && step === 0) generate(triggers, postAs);
    setStep(next);
  };

  const install = () => {
    if (!activeRepo) return;
    const body: CiExportInputBody = {
      repo: activeRepo.full_name,
      target: "gha",
      action,
      triggers,
      post_as: postAs,
      ...(editedWorkflow != null ? { workflow: editedWorkflow } : {}),
    };
    if (action === "open_pr") exportPr.mutate(body);
    else exportZip.mutate(body, { onSuccess: (blob) => saveBlob(blob, ZIP_FILENAME) });
  };

  const active = action === "open_pr" ? exportPr : exportZip;

  return {
    stepKey: STEP_KEYS[step]!,
    step,
    goTo,
    repo: activeRepo?.full_name ?? null,
    triggers,
    toggleTrigger: (t: CiTrigger) => changeChoices(toggleTrigger(triggers, t), postAs),
    postAs,
    setPostAs: (p: CiPostAs) => changeChoices(triggers, p),
    action,
    setAction,
    files,
    selected,
    selectPath: setSelectedPath,
    workflowText,
    editWorkflow,
    replaced,
    previewPending: preview.isPending,
    previewError: preview.error,
    install,
    installing: active.isPending,
    installError: active.error,
    installed: exportPr.isSuccess || exportZip.isSuccess,
    prUrl: exportPr.data?.pr_url ?? null,
  };
}

export type ExportCiWizardState = ReturnType<typeof useExportCiWizard>;
