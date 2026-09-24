"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
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
  /** Deep-link a flagged line's severity badge to its finding on the Findings tab. */
  onOpenFinding?: (id: string) => void;
}

export function DiffTab({ prId, files, canComment, onOpenFinding }: DiffTabProps) {
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      {/* No "Files changed · N files" heading: the tab already says that, and
          SmartDiffViewer's own "Reviewer-ordered diff · N files" row carries
          the count. Only the comments toggle survives from the old label. */}
      {commentCount > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Button
            kind="ghost"
            size="sm"
            icon={showComments ? "EyeOff" : "Eye"}
            onClick={() => setShowComments((v) => !v)}
          >
            {showComments ? "Hide comments" : "Show comments"} ({commentCount})
          </Button>
        </div>
      )}
      <SmartDiffViewer prId={prId} files={files} commenting={commenting} onOpenFinding={onOpenFinding} />
    </section>
  );
}
