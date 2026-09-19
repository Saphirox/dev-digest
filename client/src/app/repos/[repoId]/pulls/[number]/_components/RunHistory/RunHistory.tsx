"use client";

import React from "react";
import type { RunSummary, PrCommit, ReviewRecord } from "@devdigest/shared";
import { CommitRow } from "./_components/CommitRow";
import { RunRow } from "./_components/RunRow";
import { buildTimeline, findingsByRunId } from "./helpers";
import { s } from "./styles";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 */
export function RunHistory({
  runs,
  commits = [],
  reviews = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Persisted reviews, matched to runs by run_id, so each settled run can show
   *  its per-severity finding chips and a hover preview. The data is already on
   *  the page (usePrReviews) — this is a join, not a fetch. */
  reviews?: ReviewRecord[];
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const findingsByRun = React.useMemo(() => findingsByRunId(reviews), [reviews]);
  if (runs.length === 0 && commits.length === 0) return null;

  return (
    <div style={s.list}>
      {buildTimeline(runs, commits).map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRun.get(item.run.run_id) ?? []}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
