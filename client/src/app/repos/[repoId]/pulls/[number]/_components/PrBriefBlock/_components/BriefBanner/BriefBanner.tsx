"use client";

import React from "react";
import type { PrBrief, ReviewRecord, Verdict } from "@devdigest/shared";
import { useTranslations } from "next-intl";
import { formatUsd } from "@/lib/format-usd";
import { countBlockers } from "@/lib/severity";
import { VerdictBanner } from "../../../VerdictBanner";
import { formatTokenCount } from "../../helpers";
import { s } from "./styles";

interface BriefBannerProps {
  brief: PrBrief;
  /** The most recent completed review, or `null` when the PR has none. */
  review: ReviewRecord | null;
}

/** The brief's token counts as `in→out`, a lone known side as `N in` / `N out`,
 *  or `null` when neither is known — an unknown count is omitted, never 0. */
function tokenLabel(
  tokensIn: number | null,
  tokensOut: number | null,
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (tokensIn != null && tokensOut != null) return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
  if (tokensIn != null) return t("tokens.inOnly", { count: formatTokenCount(tokensIn) });
  if (tokensOut != null) return t("tokens.outOnly", { count: formatTokenCount(tokensOut) });
  return null;
}

/** The brief's summary. With a completed review it reuses the verdict banner
 *  (verdict, counts, score) beside the brief summary; without one it is a
 *  plain summary box. Cost and tokens sit beneath, unknown values as "—" or
 *  omitted — never 0. */
export function BriefBanner({ brief, review }: BriefBannerProps) {
  const t = useTranslations("brief");
  const tokens = tokenLabel(brief.tokens_in, brief.tokens_out, t);
  const blockers = review ? countBlockers(review.findings) : 0;
  return (
    <div style={s.wrap}>
      {review?.verdict ? (
        <VerdictBanner
          verdict={review.verdict as Verdict}
          summary={brief.summary}
          score={review.score}
          findingsCount={review.findings.length}
          blockers={blockers}
        />
      ) : (
        <div style={s.summaryBox}>
          <p style={s.summary}>{brief.summary}</p>
        </div>
      )}
      <div className="mono" style={s.meta}>
        <span>{formatUsd(brief.cost_usd)}</span>
        {tokens != null && <span>{tokens}</span>}
      </div>
    </div>
  );
}
