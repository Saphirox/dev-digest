"use client";

import { useTranslations } from "next-intl";
import React from "react";
import { Button } from "@devdigest/ui";
import { type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffViewer } from "../SmartDiffViewer";

interface DiffTabProps {
  prId: string | null;
  /** Still passed by the page; the count now renders inside SmartDiffViewer. */
  filesCount?: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  // Shares its cache with SmartDiffViewer (same `usePrSmartDiff` query key) —
  // `finding_lines` is the server-authoritative, already-in-scope count
  // (Decision 6: "the client never counts on its own"). Deliberately NOT
  // `latestFindingsPerAgent(reviews).length`: that includes dismissed and
  // off-patch findings, which Decision 4's "in-scope findings" excludes.
  const { data: smartDiff } = usePrSmartDiff(prId);
  const create = useCreatePrComment(prId);
  // The ONE toggle (Decision 4) hides both human comments and Smart Diff
  // findings. `null` means "no explicit choice yet" — the default is DERIVED
  // (on when findings exist), not synced into state on every render.
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);

  const commentCount = comments?.length ?? 0;
  const findingCount = (smartDiff?.groups ?? []).reduce(
    (n, g) => n + g.files.reduce((m, f) => m + f.finding_lines.length, 0),
    0,
  );
  const showComments = showOverride ?? findingCount > 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const toggleCount = commentCount + findingCount;

  return (
    <section>
      {/* No "Files changed · N files" heading: the tab already says that, and
          SmartDiffViewer's own "Reviewer-ordered diff · N files" row carries
          the count. Only the comments+findings toggle survives from the old
          label. */}
      {toggleCount > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Button
            kind="ghost"
            size="sm"
            icon={showComments ? "EyeOff" : "Eye"}
            onClick={() => setShowOverride(!showComments)}
          >
            {showComments
              ? t("smartDiff.toggleHide", { count: toggleCount })
              : t("smartDiff.toggleShow", { count: toggleCount })}
          </Button>
        </div>
      )}
      <SmartDiffViewer prId={prId} files={files} commenting={commenting} />
    </section>
  );
}
