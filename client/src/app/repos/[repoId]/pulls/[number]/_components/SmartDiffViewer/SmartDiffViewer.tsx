"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Severity, SmartDiffFile } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { DiffViewer, FileCard, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrSmartDiff, usePrReviews } from "@/lib/hooks";
import type { PrFile } from "@/lib/types";
import { GROUP_META, GROUP_ORDER } from "./constants";
import {
  buildFindingIdByLine,
  buildSeverityByFile,
  countFindingsBySeverityByFile,
  firstLineOfSeverity,
  severityForFlaggedLines,
} from "./helpers";
import { FindingSeverityDots } from "./_components/FindingSeverityDots";
import { s } from "./styles";

interface SmartDiffViewerProps {
  prId: string | null;
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Deep-link a flagged line's severity badge to its owning finding on the
   *  Findings tab. Omitted only by tests that don't exercise the link. */
  onOpenFinding?: (id: string) => void;
}

/** A file with no findings in `countFindingsBySeverityByFile`'s map still
 *  needs a zero record so `<FindingSeverityDots>` always gets a complete
 *  `Record<Severity, number>`. */
const EMPTY_SEVERITY_COUNTS: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };

/**
 * One row in a Smart Diff group: the per-severity findings dots SmartDiffViewer
 * owns, plus the reused `FileCard` for the actual diff body. Owns its own
 * open/scroll-target state so a badge click can force the card open and jump
 * to a flagged line without disturbing its siblings.
 */
function SmartDiffFileRow({
  file,
  prFile,
  severityByLine,
  findingIdByLine,
  counts,
  commenting,
  defaultOpen,
  onOpenFinding,
}: {
  file: SmartDiffFile;
  prFile: PrFile | null;
  severityByLine: ReadonlyMap<number, Severity> | undefined;
  findingIdByLine: ReadonlyMap<number, string> | undefined;
  counts: Record<Severity, number>;
  commenting?: DiffCommentApi;
  defaultOpen: boolean;
  onOpenFinding?: (id: string) => void;
}) {
  const t = useTranslations("smartDiff");
  const [open, setOpen] = React.useState(defaultOpen);
  const [scrollToLine, setScrollToLine] = React.useState<number | null>(null);

  // `finding_lines` is the single authoritative flagged-line set (server-
  // computed, already capped at MAX_FINDING_RANGE_LINES). It drives the
  // markers and every click target below — a dot never scrolls to a line
  // outside it. The DOTS count findings, not lines: one finding spanning
  // start_line..end_line flags many lines, so the two numbers legitimately
  // differ ("3 Critical findings" over 22 marked lines).
  const flaggedLines = file.finding_lines;
  const markers = severityForFlaggedLines(severityByLine, flaggedLines);

  const handleSeverityClick = (severity: Severity) => {
    setOpen(true);
    setScrollToLine(firstLineOfSeverity(markers, severity) ?? flaggedLines[0] ?? null);
  };

  const handleFallbackClick = () => {
    if (flaggedLines.length === 0) return;
    setOpen(true);
    setScrollToLine(flaggedLines[0]!);
  };

  // Links a line's badge to the SAME finding its colour shows — sourced from
  // `findingIdByLine`, which is built from the identical worst-severity funnel
  // as `severityByLine`, so the two can never disagree.
  const handleLineSeverityClick = (line: number) => {
    const id = findingIdByLine?.get(line);
    if (id) onOpenFinding?.(id);
  };

  const displayFile: PrFile = prFile ?? {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    patch: null,
  };

  return (
    <div>
      <FileCard
        file={displayFile}
        commenting={commenting}
        open={open}
        onOpenChange={setOpen}
        severityByLine={markers}
        lineIdPrefix={`smart-diff-${file.path}`}
        scrollToLine={scrollToLine}
        onLineSeverityClick={onOpenFinding ? handleLineSeverityClick : undefined}
        pathAdornment={
          flaggedLines.length > 0 ? (
            // One dot per present severity (worst-first), each with a
            // visible count and a real accessible name. Renders in the
            // header, so it shows on collapsed files too.
            <FindingSeverityDots
              counts={counts}
              flaggedLineCount={flaggedLines.length}
              onSelect={handleSeverityClick}
              onSelectFallback={handleFallbackClick}
            />
          ) : undefined
        }
      />
    </div>
  );
}

/**
 * Reviewer-ordered "Files changed" tab: groups a PR's files into
 * core/wiring/boilerplate (server-classified, no model call), joins in
 * per-line severity from the PR's reviews, and offers a Smart/Original
 * toggle. Falls back to the plain `DiffViewer` while loading, on error, or
 * when `prId` is null — the tab never regresses.
 */
export function SmartDiffViewer({ prId, files, commenting, onOpenFinding }: SmartDiffViewerProps) {
  const t = useTranslations("smartDiff");
  const { data: smartDiff, isLoading, isError } = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");

  const severityByFile = React.useMemo(() => buildSeverityByFile(reviews ?? []), [reviews]);
  const findingCountsByFile = React.useMemo(() => countFindingsBySeverityByFile(reviews ?? []), [reviews]);
  const findingIdByFile = React.useMemo(() => buildFindingIdByLine(reviews ?? []), [reviews]);
  const filesByPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  if (!prId || isLoading || isError || !smartDiff) {
    return <DiffViewer files={files} commenting={commenting} />;
  }

  const totals = smartDiff.groups.reduce(
    (acc, g) => {
      for (const f of g.files) {
        acc.n += 1;
        acc.a += f.additions;
        acc.d += f.deletions;
      }
      return acc;
    },
    { n: 0, a: 0, d: 0 },
  );

  return (
    <div>
      <div style={s.heading}>{t("header")}</div>
      <div style={s.header}>
        <span style={s.stats}>
          {t.rich("stats", {
            n: totals.n,
            a: totals.a,
            d: totals.d,
            add: (chunks) => <span style={s.statsAdd}>{chunks}</span>,
            del: (chunks) => <span style={s.statsDel}>{chunks}</span>,
          })}
        </span>
        <div style={s.toggle} role="group" aria-label={t("header")}>
          <button
            type="button"
            style={s.toggleBtn(order === "smart")}
            onClick={() => setOrder("smart")}
          >
            {t("order.smart")}
          </button>
          <button
            type="button"
            style={s.toggleBtn(order === "original")}
            onClick={() => setOrder("original")}
          >
            {t("order.original")}
          </button>
        </div>
      </div>

      {order === "original" ? (
        <DiffViewer files={files} commenting={commenting} />
      ) : (
        <div style={s.groups}>
          {GROUP_ORDER.map((role) => {
            const group = smartDiff.groups.find((g) => g.role === role);
            const meta = GROUP_META[role];
            // The server deliberately always emits all three groups (plan
            // 0004, chosen option — do not "fix" it server-side) so the
            // payload shape stays stable; hiding an empty one here is a
            // render decision, not a contract change.
            if (!group || group.files.length === 0) return null;
            return (
              <div key={role}>
                <div style={s.groupHeader}>
                  <span aria-hidden="true" style={s.groupDot(meta.dotColor)} />
                  <span style={s.groupLabel}>{t(meta.labelKey)}</span>
                  <span style={s.groupBlurb}>{t(meta.blurbKey)}</span>
                  <span style={s.groupCount}>{t("groups.fileCount", { count: group.files.length })}</span>
                </div>
                <div style={s.groupFiles}>
                  {group.files.map((file) => (
                    <SmartDiffFileRow
                      key={file.path}
                      file={file}
                      prFile={filesByPath.get(file.path) ?? null}
                      severityByLine={severityByFile.get(file.path)}
                      findingIdByLine={findingIdByFile.get(file.path)}
                      counts={findingCountsByFile.get(file.path) ?? EMPTY_SEVERITY_COUNTS}
                      commenting={commenting}
                      defaultOpen={meta.defaultOpen}
                      onOpenFinding={onOpenFinding}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
