/* SmartDiffGroup — one of the five always-rendered role groups (Decision 10):
   a collapsible chevron header (label, blurb, `● N` files-with-findings or
   "review not run yet", then "N files"), and its file rows. Collapsing
   unmounts the body (file open/scroll state resets — a documented risk). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffFile, SmartDiffRole } from "@devdigest/shared";
import { GROUP_META } from "../../constants";
import { filesWithFindings } from "../../helpers";
import { FindingsDot } from "../FindingsDot";
import { s, chevronFor } from "./styles";

export function SmartDiffGroup({
  role,
  files,
  reviewsLoading,
  hasReviewRun,
  children,
}: {
  role: SmartDiffRole;
  files: readonly SmartDiffFile[];
  /** Hides the `● N` / "review not run yet" slot while `usePrReviews` is
   *  still loading, so the header never flashes a wrong empty state. */
  reviewsLoading: boolean;
  hasReviewRun: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const meta = GROUP_META[role];
  const [expanded, setExpanded] = React.useState(true);
  const withFindings = filesWithFindings(files);

  return (
    <div>
      <div style={s.header}>
        <button
          type="button"
          aria-expanded={expanded}
          style={s.chevronBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon.ChevronRight size={13} style={chevronFor(expanded)} />
          <span style={s.label}>{t(`smartDiff.${meta.labelKey}`)}</span>
        </button>
        <span style={s.blurb}>{t(`smartDiff.${meta.blurbKey}`)}</span>
        {!reviewsLoading &&
          (hasReviewRun ? (
            <FindingsDot count={withFindings} label={t("smartDiff.filesWithFindings", { count: withFindings })} />
          ) : (
            <span style={s.reviewNotRun}>{t("smartDiff.reviewNotRun")}</span>
          ))}
        <span style={s.count}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </div>
      {expanded && <div style={s.files}>{children}</div>}
    </div>
  );
}
