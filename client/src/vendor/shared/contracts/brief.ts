import { z } from 'zod';

/**
 * PR Brief contracts: the generated PrBrief (summary, risks, review focus),
 * plus the Intent, Blast radius, PR History and Smart Diff shapes used by the
 * neighbouring Overview blocks.
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

/** Mirrors repo-intel's `DegradedReason` (repo-intel/types.ts:27-32) —
 *  extends the wire contract to carry the per-call degraded signal the
 *  facade already produces internally (repo-intel/types.ts:15-21,
 *  "DEGRADED CONTRACT"). */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  /** The symbol's own declaring file, so a caller in the same file can
   *  be told apart from a real external caller. */
  file: z.string().optional(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
  /** Highest caller rank for this symbol, for sort/emphasis. */
  rank: z.number().optional(),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  /** Deterministic count string on the read path; only ever
   *  LLM-authored text if/when the P2 summary trigger (Step 15) is
   *  built. Nullable so the deterministic path can omit it. */
  summary: z.string().nullable(),
  /** True when this specific call fell back to a non-persistent path. */
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
  /** The repo-intel index's `lastIndexedSha` at the time of this read,
   *  for an accurate GitHub blob link (falls back to the PR's
   *  head_sha client-side when absent). */
  indexed_sha: z.string().nullable().optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

/** A grounded reference to a file (and optionally a line range) the PR Brief
 *  model cited — a structured location, not a display string, so the client can
 *  build a link without re-parsing a `"path:12-18"` string. The server drops a
 *  ref whose file is not part of the PR or its blast map. */
export const RiskFileRef = z.object({
  file: z.string(),
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
});
export type RiskFileRef = z.infer<typeof RiskFileRef>;

/** One model-identified risk in the PR Brief. `kind` is free text. */
export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(RiskFileRef),
});
export type Risk = z.infer<typeof Risk>;

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
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
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

// ---- PR Brief (pr_brief.json) ----
/** A file + line the reviewer should read first, with the reason. */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/** One changed PR file's one-line "what this does", written by the brief's
 *  model call from facts only (path, role, counts, changed symbol names). */
export const FileSummary = z.object({
  file: z.string(),
  summary: z.string(),
});
export type FileSummary = z.infer<typeof FileSummary>;

/** The generated PR Brief: one `risk_brief` model call over PR facts (no diff
 *  hunks), stored per PR with the head SHA it was generated for. Intent and
 *  Blast radius are separate blocks, not part of this record. */
export const PrBrief = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
  /** Per-file summaries for Files changed. Defaults to [] for briefs stored
   *  before the field existed. */
  file_summaries: z.array(FileSummary).default([]),
  generated_for_sha: z.string(),
  generated_at: z.string(),
  /** Fixed labels of inputs that were unavailable when generating. */
  missing_inputs: z.array(z.string()),
  cost_usd: z.number().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
});
export type PrBrief = z.infer<typeof PrBrief>;
