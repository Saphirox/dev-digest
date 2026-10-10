import { z } from 'zod';
import { Severity } from './findings.js';
import { ReviewRecord } from './review-api.js';
import { RunSummary } from './trace.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /multi-runs/:id
 *   - FindingGroup         findings from several agents overlapping on one file range
 *   - AgentRunEstimate     per-agent average duration/cost for the picker
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** One finding's membership in a group: which agent/run reported it. */
export const FindingGroupMember = z.object({
  finding_id: z.string(),
  agent_id: z.string(),
  run_id: z.string(),
});
export type FindingGroupMember = z.infer<typeof FindingGroupMember>;

/**
 * Findings from different agents that overlap on the same file and line range.
 * `conflict` = a `done` participant has no member in the group, or the members'
 * severities differ. Computed from persisted findings; not stored.
 */
export const FindingGroup = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  conflict: z.boolean(),
  members: z.array(FindingGroupMember),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** Response of GET /multi-runs/:id. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  ran_at: z.string(),
  runs: z.array(RunSummary),
  reviews: z.array(ReviewRecord),
  groups: z.array(FindingGroup),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Per-agent average duration/cost over its past done runs; null when none. */
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  avg_duration_ms: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
