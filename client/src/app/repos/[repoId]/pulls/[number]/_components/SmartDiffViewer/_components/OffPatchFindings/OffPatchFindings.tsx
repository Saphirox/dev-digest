/* OffPatchFindings — end-of-file block for findings whose flagged line isn't
   in the current patch (P2 "off-patch finding → end-of-file block"). Styled
   after `client/src/components/diff-viewer`'s `OutdatedComments`. */
"use client";

import { useTranslations } from "next-intl";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { InlineFindings } from "../InlineFindings";
import { s } from "./styles";

export function OffPatchFindings({
  findings,
  onAction,
  pending,
}: {
  findings: readonly FindingRecord[];
  onAction?: (id: string, action: FindingActionKind) => void;
  pending?: boolean;
}) {
  const t = useTranslations("prReview");
  if (findings.length === 0) return null;
  return (
    <div style={s.wrap}>
      <span style={s.title}>{t("smartDiff.offPatchTitle")}</span>
      <InlineFindings findings={findings} revealNonce={0} onAction={onAction} pending={pending} />
    </div>
  );
}
