/* SmartDiffFileRow — one file in a Smart Diff group: the plain "has
   findings" dot (Decision 11) plus the reused `FileCard`, wired with inline
   finding cards under their flagged line and an end-of-file off-patch block.
   Owns its own open/reveal state so a badge click can force the card open
   and scroll to a finding without disturbing its siblings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingActionKind, FindingRecord, Severity, SmartDiffFile } from "@devdigest/shared";
import { FileCard, lineKey, lineKeysForPatch, AUTO_EXPAND_MAX_LINES, type DiffCommentApi } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import { partitionFileFindings, severityForFlaggedLines } from "../../helpers";
import { InlineFindings } from "../InlineFindings";
import { OffPatchFindings } from "../OffPatchFindings";
import { FindingsDot } from "../FindingsDot";

export function SmartDiffFileRow({
  file,
  prFile,
  severityByLine,
  findings,
  commenting,
  filesCollapsed,
  showFindings,
  onAction,
  pending,
}: {
  file: SmartDiffFile;
  prFile: PrFile | null;
  severityByLine: ReadonlyMap<number, Severity> | undefined;
  /** Every latest-per-agent finding on this file, INCLUDING dismissed ones —
   *  `partitionFileFindings` decides what's shown where. */
  findings: readonly FindingRecord[];
  commenting?: DiffCommentApi;
  /** From `GROUP_META[role].filesCollapsed` — docs/boilerplate start closed
   *  regardless of size. */
  filesCollapsed: boolean;
  /** The one toggle (`DiffTab`) hiding both comments and findings. */
  showFindings: boolean;
  onAction?: (id: string, action: FindingActionKind) => void;
  pending?: boolean;
}) {
  const t = useTranslations("prReview");
  const displayFile: PrFile = prFile ?? {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    patch: null,
  };
  const [open, setOpen] = React.useState(
    filesCollapsed ? false : displayFile.additions + displayFile.deletions <= AUTO_EXPAND_MAX_LINES,
  );
  // Which inline card to force-expand + scroll to, and a nonce that remounts
  // it (defaultExpanded is only read on mount) even if the reader collapsed
  // it since the last click.
  const [reveal, setReveal] = React.useState<{ key: string; nonce: number } | null>(null);

  const flaggedLines = file.finding_lines;
  const markers = severityForFlaggedLines(severityByLine, flaggedLines);
  const renderedKeys = React.useMemo(() => lineKeysForPatch(displayFile.patch), [displayFile.patch]);
  const { inlineByKey, offPatch } = React.useMemo(
    () => partitionFileFindings(findings, renderedKeys, flaggedLines),
    [findings, renderedKeys, flaggedLines],
  );

  const handleLineSeverityClick = showFindings
    ? (line: number) => {
        const key = lineKey("RIGHT", line);
        if (!key) return;
        setOpen(true);
        setReveal((prev) => ({ key, nonce: (prev?.key === key ? prev.nonce : 0) + 1 }));
      }
    : undefined;

  const lineExtras = React.useMemo(() => {
    if (!showFindings) return undefined;
    const map = new Map<string, React.ReactNode>();
    for (const [key, list] of inlineByKey) {
      map.set(
        key,
        <InlineFindings
          findings={list}
          revealNonce={reveal?.key === key ? reveal.nonce : 0}
          onAction={onAction}
          pending={pending}
        />,
      );
    }
    return map;
  }, [showFindings, inlineByKey, reveal, onAction, pending]);

  return (
    <FileCard
      file={displayFile}
      commenting={commenting}
      open={open}
      onOpenChange={setOpen}
      severityByLine={markers}
      pathAdornment={flaggedLines.length > 0 ? <FindingsDot label={t("smartDiff.hasFindings")} /> : undefined}
      onLineSeverityClick={handleLineSeverityClick}
      lineExtras={lineExtras}
      footer={
        showFindings && offPatch.length > 0 ? (
          <OffPatchFindings findings={offPatch} onAction={onAction} pending={pending} />
        ) : undefined
      }
    />
  );
}
