import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/severity";

/** Every non-dismissed finding across a PR's reviews, worst severity first —
 *  the same set the list's per-severity counts describe (the server's counts
 *  also exclude dismissed findings). */
export function openFindings(reviews: ReviewRecord[]): FindingRecord[] {
  return sortBySeverity(reviews.flatMap((r) => r.findings).filter((f) => !f.dismissed_at));
}
