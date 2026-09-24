/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  open: openProp,
  onOpenChange,
  severityByLine,
  lineIdPrefix,
  scrollToLine,
  pathAdornment,
  onLineSeverityClick,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Controlled open state. When omitted, the card manages its own state
   *  (auto-expanded under `AUTO_EXPAND_MAX_LINES`) — every existing call site
   *  is unaffected. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Worst severity per NEW-side line number (`ln.newNo`). */
  severityByLine?: ReadonlyMap<number, Severity>;
  /** Prefix for each rendered line's DOM id (`${lineIdPrefix}-L${ln.newNo}`). */
  lineIdPrefix?: string;
  /** New-side line number to scroll into view once the card is open. */
  scrollToLine?: number | null;
  /** Rendered immediately after the file path, before the `+N −M` stat — the
   *  slot for a per-file status marker. It MAY be
   *  interactive: the header `<div>` carries the open/close `onClick`, so an
   *  interactive adornment must call `stopPropagation` itself. Optional. */
  pathAdornment?: React.ReactNode;
  /** When set, a flagged line's severity badge becomes a button calling this
   *  with the line's new-side number. Omitted ⇒ badges stay plain spans. */
  onLineSeverityClick?: (line: number) => void;
}) {
  const t = useTranslations("shell");
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const isOpen = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (openProp === undefined) setUncontrolledOpen(next);
    },
    [onOpenChange, openProp]
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  React.useEffect(() => {
    if (!isOpen || scrollToLine == null || !lineIdPrefix) return;
    document.getElementById(`${lineIdPrefix}-L${scrollToLine}`)?.scrollIntoView({ block: "center" });
  }, [scrollToLine, isOpen, lineIdPrefix]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen(!isOpen)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(isOpen)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span style={s.pathWrap}>
          <span className="mono" style={s.filePath}>
            {file.path}
          </span>
          {pathAdornment}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {isOpen && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                severity={ln.newNo != null ? severityByLine?.get(ln.newNo) : undefined}
                domId={lineIdPrefix && ln.newNo != null ? `${lineIdPrefix}-L${ln.newNo}` : undefined}
                onSeverityClick={
                  onLineSeverityClick && ln.newNo != null
                    ? () => onLineSeverityClick(ln.newNo!)
                    : undefined
                }
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
