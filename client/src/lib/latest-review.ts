/**
 * The PR's current review: the newest record of the list. The API returns
 * reviews newest-first and the Agent runs tab treats `runs[0]` as current
 * (it opens first and carries the verdict banner), so the Overview brief
 * banner reads the same record from here and can never show an older run.
 * A newest record without a verdict shows no verdict banner on either
 * surface; this does not skip past it to an older run.
 */
import type { ReviewRecord } from "@devdigest/shared";

export function latestReview(reviews: readonly ReviewRecord[] | null | undefined): ReviewRecord | null {
  return reviews?.[0] ?? null;
}
