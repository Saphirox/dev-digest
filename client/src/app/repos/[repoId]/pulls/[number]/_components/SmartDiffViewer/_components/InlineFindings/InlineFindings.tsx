/* InlineFindings — one or more finding cards rendered inline under their
   flagged line (or, via OffPatchFindings, in the end-of-file block). Each
   card starts expanded and one-line-collapsible (`hideLocation`); changing
   `revealNonce` remounts the cards (key includes it) so a badge click
   re-expands and scrolls to them even if the reader had collapsed one. */
"use client";

import React from "react";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../../../FindingCard";
import { sortBySeverity } from "@/lib/severity";
import { s } from "./styles";

function RevealCard({
  f,
  revealNonce,
  onAction,
  pending,
}: {
  f: FindingRecord;
  revealNonce: number;
  onAction?: (id: string, action: FindingActionKind) => void;
  pending?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (revealNonce > 0) ref.current?.scrollIntoView({ block: "nearest" });
  }, [revealNonce]);

  return (
    <div ref={ref}>
      <FindingCard
        f={f}
        defaultExpanded
        hideLocation
        pending={pending}
        onAction={onAction ? (action) => onAction(f.id, action) : undefined}
      />
    </div>
  );
}

export function InlineFindings({
  findings,
  revealNonce,
  onAction,
  pending,
}: {
  findings: readonly FindingRecord[];
  /** Bumped (never 0 on first render) to force a remount + scroll — see
   *  `SmartDiffFileRow`'s `reveal` state. */
  revealNonce: number;
  onAction?: (id: string, action: FindingActionKind) => void;
  pending?: boolean;
}) {
  if (findings.length === 0) return null;
  return (
    <div style={s.thread}>
      {sortBySeverity(findings).map((f) => (
        <RevealCard
          key={`${f.id}:${revealNonce}`}
          f={f}
          revealNonce={revealNonce}
          onAction={onAction}
          pending={pending}
        />
      ))}
    </div>
  );
}
