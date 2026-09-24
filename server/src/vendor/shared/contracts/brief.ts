import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Intent Layer (cheap PR-intent classifier) ----
/** Where one piece of intent evidence came from. */
export const IntentSourceKind = z.enum(['pr_title_body', 'linked_issue', 'repo_file', 'external_link']);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** One evidence source the classifier tried to read, and whether it could. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  ok: z.boolean(),
  note: z.string().nullable(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** Persisted per-PR intent record (`pr_intent` table), with freshness + provenance. */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  derived_for_sha: z.string().nullable(),
  derived_at: z.string().nullable(),
  stale: z.boolean(),
  sources: z.array(IntentSource),
  missing_context: z.array(z.string()),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Result of one classifier run (`POST /pulls/:id/intent/derive`). */
export const IntentDeriveResult = z.object({
  intent: PrIntentRecord,
  cost_usd: z.number().nullable(),
  model: z.string(),
  provider: z.string(),
});
export type IntentDeriveResult = z.infer<typeof IntentDeriveResult>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

/** The 3 deterministic detector families a risk can come from (Risk Areas). */
export const RiskKind = z.enum(['auth_surface', 'new_dependency', 'performance']);
export type RiskKind = z.infer<typeof RiskKind>;

/** A grounded `path:start-end` reference into the new side of the diff — a
 *  structured location, not a display string, so the client can build a
 *  GitHub blob link without re-parsing a `"path:12-18"` string. */
export const RiskRef = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type RiskRef = z.infer<typeof RiskRef>;

export const Risk = z.object({
  kind: RiskKind,
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  refs: z.array(RiskRef),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

/** Result of one deterministic risk scan (`GET /pulls/:id/risks`) — no model
 *  call, recomputed from the diff on every read (see the risk-source ADR in
 *  `docs/plans/0003-intent-card-risk-areas.md`). */
export const PrRisks = z.object({
  pr_id: z.string(),
  derived_for_sha: z.string(),
  risks: z.array(Risk),
  scanned: z.object({
    files: z.number().int(),
    added_lines: z.number().int(),
  }),
});
export type PrRisks = z.infer<typeof PrRisks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
