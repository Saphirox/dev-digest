"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingActionKind } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrSmartDiff, usePrReviews, useFindingAction } from "@/lib/hooks";
import type { PrFile } from "@/lib/types";
import { GROUP_ORDER, GROUP_META } from "./constants";
import { buildSeverityByFile, findingsByFile, hasReviewRun } from "./helpers";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { SmartDiffFileRow } from "./_components/SmartDiffFileRow";
import { s } from "./styles";

interface SmartDiffViewerProps {
  prId: string | null;
  files: PrFile[];
  commenting?: DiffCommentApi;
}

/**
 * Reviewer-ordered "Files changed" tab: groups a PR's files into
 * core/tests/wiring/docs/boilerplate (server-classified, no model call),
 * joins in per-line severity + inline finding cards from the PR's reviews,
 * and offers a Smart/Original toggle. Falls back to the plain `DiffViewer`
 * while loading, on error, or when `prId` is null — the tab never regresses.
 */
export function SmartDiffViewer({ prId, files, commenting }: SmartDiffViewerProps) {
  const t = useTranslations("prReview");
  const { data: smartDiff, isLoading, isError } = usePrSmartDiff(prId);
  const { data: reviews, isLoading: reviewsLoading } = usePrReviews(prId);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  const findingAction = useFindingAction();

  const severityByFile = React.useMemo(() => buildSeverityByFile(reviews ?? []), [reviews]);
  const findingsByFileMap = React.useMemo(() => findingsByFile(reviews ?? []), [reviews]);
  const filesByPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  // The one toggle (Decision 4) hides both human comments AND findings —
  // `commenting.showComments` is that single flag, owned by `DiffTab`.
  const showFindings = commenting?.showComments ?? true;

  const onAction = prId
    ? (findingId: string, action: FindingActionKind) => findingAction.mutate({ findingId, action, prId })
    : undefined;

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
  const reviewHasRun = hasReviewRun(reviews);

  return (
    <div>
      <div style={s.heading}>{t("smartDiff.header")}</div>
      <div style={s.header}>
        <span style={s.stats}>
          {t.rich("smartDiff.stats", {
            n: totals.n,
            a: totals.a,
            d: totals.d,
            add: (chunks) => <span style={s.statsAdd}>{chunks}</span>,
            del: (chunks) => <span style={s.statsDel}>{chunks}</span>,
          })}
        </span>
        <div style={s.toggle} role="group" aria-label={t("smartDiff.header")}>
          <button type="button" style={s.toggleBtn(order === "smart")} onClick={() => setOrder("smart")}>
            {t("smartDiff.orderSmart")}
          </button>
          <button type="button" style={s.toggleBtn(order === "original")} onClick={() => setOrder("original")}>
            {t("smartDiff.orderOriginal")}
          </button>
        </div>
      </div>

      {order === "original" ? (
        <DiffViewer files={files} commenting={commenting} />
      ) : (
        <div style={s.groups}>
          {GROUP_ORDER.map((role) => {
            const groupFiles = smartDiff.groups.find((g) => g.role === role)?.files ?? [];
            return (
              <SmartDiffGroup
                key={role}
                role={role}
                files={groupFiles}
                reviewsLoading={reviewsLoading}
                hasReviewRun={reviewHasRun}
              >
                {groupFiles.map((file) => (
                  <SmartDiffFileRow
                    key={file.path}
                    file={file}
                    prFile={filesByPath.get(file.path) ?? null}
                    severityByLine={severityByFile.get(file.path)}
                    findings={findingsByFileMap.get(file.path) ?? []}
                    commenting={commenting}
                    filesCollapsed={GROUP_META[role].filesCollapsed}
                    showFindings={showFindings}
                    onAction={onAction}
                    pending={findingAction.isPending}
                  />
                ))}
              </SmartDiffGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}
