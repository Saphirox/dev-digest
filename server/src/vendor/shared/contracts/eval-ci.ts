import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalExpectationKind,
  EvalExpectation,
  EvalCase,
  EvalCaseResult,
  Conformance,
  Provider,
  CiFailOn,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — cases, suite runs, case results, dashboard (SPEC-0003)
// ===========================================================================
// `EvalExpectation`, `EvalCase` and `EvalCaseResult` live in `knowledge.ts`
// (`EvalCase.latest_result` embeds a result, so they cannot import from here).

/** Create payload for an agent-owned eval case (owner resolved from the route). */
export const EvalCaseInput = z.object({
  name: z.string().min(1).max(200),
  /** Unified-diff fragment WITH file headers (`diff --git` / `---` / `+++`). */
  input_diff: z.string().min(1).max(200_000),
  expected_output: EvalExpectation,
  notes: z.string().max(2_000).nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** `PUT /eval-cases/:id` — name and expectation only; the diff never changes. */
export const EvalCaseUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  expected_output: EvalExpectation.optional(),
});
export type EvalCaseUpdate = z.infer<typeof EvalCaseUpdate>;

/** `POST /findings/:id/eval-case` body. `kind` is required only for undecided findings. */
export const EvalCaseFromFindingInput = z.object({
  kind: EvalExpectationKind.optional(),
});
export type EvalCaseFromFindingInput = z.infer<typeof EvalCaseFromFindingInput>;

/** `created: false` means a case for this finding already existed (EC-2). */
export const EvalCaseFromFindingResult = z.object({
  case: EvalCase,
  created: z.boolean(),
});
export type EvalCaseFromFindingResult = z.infer<typeof EvalCaseFromFindingResult>;

export const EvalSuiteRunStatus = z.enum(['running', 'done', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

/** The three scored metrics, each 0..1 or null (no denominator, or a failed run). */
export const EvalMetricName = z.enum(['recall', 'precision', 'citation_accuracy']);
export type EvalMetricName = z.infer<typeof EvalMetricName>;

/** One suite run: the agent over its whole eval set. Metrics are null while running or failed. */
export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  /** Agent version number at start. */
  agent_version: z.number().int(),
  status: EvalSuiteRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cases_passed: z.number().int().nullable(),
  cases_total: z.number().int(),
  /** Null when the cost of any case review is unknown (EC-12). */
  cost_usd: z.number().nullable(),
  /** Failure reason (EC-7, EC-17); null unless status is `failed`. */
  error: z.string().nullable(),
  /** Name of the case whose review failed; null unless status is `failed`. */
  failing_case: z.string().nullable(),
  model: z.string(),
  provider: z.string(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** A suite run with its saved effective prompt and one result per case. */
export const EvalSuiteRunDetail = EvalSuiteRun.extend({
  effective_prompt: z.string(),
  case_results: z.array(EvalCaseResult),
});
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

/** 202 body of `POST /agents/:id/eval-runs`. */
export const EvalRunAccepted = z.object({
  run_id: z.string(),
  status: z.literal('running'),
});
export type EvalRunAccepted = z.infer<typeof EvalRunAccepted>;

export const EvalPeriod = z.enum(['7d', '30d', '90d', 'all']);
export type EvalPeriod = z.infer<typeof EvalPeriod>;

/** One point per `done` suite run on the trend chart / sparklines (chronological). */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  agent_version: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Per-agent dashboard: latest `done` run, change vs the previous `done` run, trend, runs. */
export const EvalDashboard = z.object({
  agent_id: z.string(),
  cases_total: z.number().int(),
  /** Latest `done` suite run; null when none exists. */
  current: z
    .object({
      run_id: z.string(),
      agent_version: z.number().int(),
      ran_at: z.string(),
      recall: z.number().nullable(),
      precision: z.number().nullable(),
      citation_accuracy: z.number().nullable(),
      cases_passed: z.number().int().nullable(),
      cases_total: z.number().int(),
      cost_usd: z.number().nullable(),
    })
    .nullable(),
  /** Signed change (fraction) vs the previous `done` run; null without a previous run. */
  delta: z
    .object({
      recall: z.number().nullable(),
      precision: z.number().nullable(),
      citation_accuracy: z.number().nullable(),
    })
    .nullable(),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalSuiteRun),
  /** Set when the latest `done` run dropped a metric by >= 1 point (AC-36). */
  regression: z
    .object({
      version: z.number().int(),
      metrics: z.array(z.object({ metric: EvalMetricName, drop_pts: z.number() })),
    })
    .nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

/** A suite run listed across agents, labelled with its (live) agent's name. */
export const EvalOverviewRun = EvalSuiteRun.extend({ agent_name: z.string() });
export type EvalOverviewRun = z.infer<typeof EvalOverviewRun>;

/** One Eval Dashboard row: an existing agent with at least one eval case. */
export const EvalOverviewAgent = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  provider: z.string(),
  cases_total: z.number().int(),
  /** Most recent suite run of any status (a `running` one marks the row as running). */
  latest_run: EvalSuiteRun.nullable(),
  trend: z.array(EvalTrendPoint),
});
export type EvalOverviewAgent = z.infer<typeof EvalOverviewAgent>;

/** `GET /eval/overview` — Eval Dashboard page payload. */
export const EvalOverview = z.object({
  agents: z.array(EvalOverviewAgent),
  recent_runs: z.array(EvalOverviewRun),
});
export type EvalOverview = z.infer<typeof EvalOverview>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** `pull_request` event types the exported workflow reacts to. */
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** How a CI run is judged against the agent's `ci_fail_on` policy. */
export const CiVerdict = z.enum(['passed', 'changes_requested', 'failed']);
export type CiVerdict = z.infer<typeof CiVerdict>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns them as a zip. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
  /** The (possibly edited) workflow file; replaces the generated one when set. */
  workflow: z.string().max(100_000).optional(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** Request body for `POST /agents/:id/export-ci/preview`. */
export const CiPreviewInput = CiExportInput.pick({ triggers: true, post_as: true });
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiPreviewInputBody = z.input<typeof CiPreviewInput>;

/** Response of `POST /agents/:id/export-ci/preview`. */
export const CiPreview = z.object({
  files: z.array(CiFile),
});
export type CiPreview = z.infer<typeof CiPreview>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
  /** Agent version number at export time; null for rows that predate the column. */
  agent_version: z.number().int().nullable(),
  /** Latest ingested CI run for this repository; null when none yet. */
  latest_run: z
    .object({ verdict: CiVerdict, ran_at: z.string().nullable() })
    .nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci` when `action` is `open_pr`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI Runs page row — ingested from GitHub Actions artifacts; null where unknown. */
export const CiRun = z.object({
  id: z.string(),
  repo: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  agent_name: z.string().nullable(),
  verdict: CiVerdict,
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  job_url: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Response of `POST /ci/runs/refresh`. */
export const CiRefreshResult = z.object({
  ingested: z.number().int(),
  /** Repositories whose runs could not be listed or read this refresh. */
  failed_repos: z.array(z.string()),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  // Bounded to the Postgres `integer` range: the artifact is attacker-controlled (fork PRs).
  findings_count: z.number().int().min(0).max(2_147_483_647),
  critical: z.number().int().min(0).max(2_147_483_647).nullish(),
  warning: z.number().int().min(0).max(2_147_483_647).nullish(),
  suggestion: z.number().int().min(0).max(2_147_483_647).nullish(),
  cost_usd: z.number().finite().min(0).nullable(),
  duration_ms: z.number().int().min(0).max(2_147_483_647).nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().min(0).max(2_147_483_647).nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
