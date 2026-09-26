/**
 * The findings that count for a PR, mirroring the server's
 * `latestFindingRangesForPull`: only `kind === "review"` rows count, and only
 * the NEWEST review per `agent_id` — a `null` agent id (the seeded demo
 * review has none) collapses every agent-less review into one group.
 *
 * Shared by `DiffTab` (the toggle's finding count) and `SmartDiffViewer`
 * (colouring/finding lookups) so the two can never disagree about *which*
 * review they describe (Decision 5 — a documented deviation from the spec's
 * literal "latest review": a multi-agent run writes one `reviews` row per
 * agent, so "the latest review" alone would hide all agents' findings but
 * one).
 */
import type { ReviewRecord } from "@devdigest/shared";

export function latestFindingsPerAgent(reviews: ReviewRecord[]): ReviewRecord["findings"] {
  const latestByAgent = new Map<string | null, ReviewRecord>();
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const current = latestByAgent.get(review.agent_id);
    if (!current || review.created_at > current.created_at) {
      latestByAgent.set(review.agent_id, review);
    }
  }
  return [...latestByAgent.values()].flatMap((review) => review.findings);
}
