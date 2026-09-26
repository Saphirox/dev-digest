/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import type { Severity } from "@devdigest/shared";
import { Icon, SEV } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { LINE_BADGE_LABEL } from "../constants";
import { s, lineRowFor, lineSignFor, severityBorderFor, lineBadge, lineBadgeButton } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  severity,
  extras,
  onSeverityClick,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Worst severity flagging this line, or `null`/`undefined` for none —
   *  when set, renders a coloured left border + right-hand marker. */
  severity?: Severity | null;
  /** Rendered after the comment threads, before the inline composer — the
   *  slot for an inline finding card. Optional; the plain `DiffViewer` path
   *  never sets it. */
  extras?: React.ReactNode;
  /** When set, the severity badge renders as a `<button>` that calls this
   *  instead of a plain `<span>` — the plain `DiffViewer` path never sets it,
   *  so its render stays byte-identical. */
  onSeverityClick?: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const sevMeta = severity ? SEV[severity] : undefined;
  const SevIcon = Icon[sevMeta?.icon ?? "Info"];

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(severity ? severityBorderFor(severity) : {}) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {severity && onSeverityClick && (
          // Unlike the old dot (decorative, `aria-hidden`), this badge
          // carries visible text (`blocker`/`warning`/`suggestion`) that IS
          // its accessible name — never hide it from assistive tech. No
          // `aria-label`/`title`/i18n: the visible label stays the name.
          <button type="button" style={lineBadgeButton(severity)} onClick={onSeverityClick}>
            <SevIcon size={11} />
            {LINE_BADGE_LABEL[severity]}
          </button>
        )}
        {severity && !onSeverityClick && (
          // Unlike the old dot (decorative, `aria-hidden`), this badge
          // carries visible text (`blocker`/`warning`/`suggestion`) that IS
          // its accessible name — never hide it from assistive tech.
          <span style={lineBadge(severity)}>
            <SevIcon size={11} />
            {LINE_BADGE_LABEL[severity]}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {extras}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
