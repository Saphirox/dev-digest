/* FindingsCell — the PR list's FINDINGS column: per-severity chips, plus a
   hover card listing the PR's open findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Severity } from "@devdigest/shared";
import { FindingsPreviewCard, SeverityCountChips, useHoverPreview } from "@/components/findings-preview";
import { usePrReviews } from "@/lib/hooks/reviews";
import { openFindings } from "./helpers";
import { s } from "./styles";

export function FindingsCell({
  prId,
  counts,
}: {
  /** Nullish for PRs not yet stored (PrMeta also types GitHub-only rows): never fetches. */
  prId: string | null | undefined;
  /** Per-severity counts from the list payload; absent when never reviewed. */
  counts: Record<Severity, number> | null | undefined;
}) {
  const t = useTranslations("prReview");
  const { anchor, onMouseEnter, onMouseLeave } = useHoverPreview();
  // The list payload carries only the COUNTS. The card needs the findings
  // themselves, so they are fetched the first time the cell is hovered and then
  // cached by react-query — the list response stays small and no request is
  // made for a PR nobody points at.
  const [wantFindings, setWantFindings] = React.useState(false);
  const { data: reviews } = usePrReviews(wantFindings ? prId : null);
  const findings = React.useMemo(() => openFindings(reviews ?? []), [reviews]);

  return (
    <div
      style={s.cell}
      onMouseEnter={(e) => {
        setWantFindings(true);
        onMouseEnter(e);
      }}
      onMouseLeave={onMouseLeave}
    >
      {counts ? <SeverityCountChips counts={counts} /> : null}
      {anchor && findings.length > 0 && (
        <FindingsPreviewCard
          findings={findings}
          title={t("list.findingsInPr", { count: findings.length })}
          top={anchor.top}
          left={anchor.left}
        />
      )}
    </div>
  );
}
