import {
  EvalExpectation,
  FindingCategory,
  Severity,
  type EvalCase,
  type EvalCaseResult,
  type EvalDashboard,
  type EvalExpectationKind,
  type EvalMetricName,
  type EvalOverviewRun,
  type EvalPeriod,
  type EvalSuiteRun,
  type EvalSuiteRunDetail,
  type EvalTrendPoint,
  type Finding,
  type UnifiedDiff,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../../lib/diff-parser.js';
import { walkDiff } from '../../lib/diff-lines.js';
import { MAX_DIFF_FILES, PERIOD_DAYS, REGRESSION_THRESHOLD } from './constants.js';
import type {
  EvalCaseRecord,
  EvalCaseResultRecord,
  EvalOverviewRunRecord,
  EvalSuiteRunDetailRecord,
  EvalSuiteRunRecord,
} from './ports.js';

/**
 * Pure helpers for the evals module — diff handling, expectation matching, the
 * scorer, dashboard maths and record → DTO mapping. No I/O, no LLM call: scoring
 * a stored run again is free (NFR-1).
 */

// ---- diff handling ---------------------------------------------------------

/**
 * A stored `pr_files.patch` starts at its first `@@` with no file header; prepend
 * the header lines so the parser yields the file (same shape as
 * `reviews/diff-loader.ts#diffFromPrFiles`).
 */
export function headeredPatch(path: string, patch: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');
}

/**
 * file → new-side line numbers covered by the diff's hunks. Built from each hunk's
 * actual body lines only: reviewer-core's `buildLineIndex` falls back to the
 * hunk's declared `+start,len` range when a hunk has no body, and a user-written
 * eval diff can declare an absurd length there.
 */
function lineIndexOf(diff: UnifiedDiff): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const set = idx.get(f.path) ?? new Set<number>();
    for (const h of f.hunks) for (const n of h.newLineNumbers ?? []) set.add(n);
    idx.set(f.path, set);
  }
  return idx;
}

export function hunkLineIndex(diff: string): Map<string, Set<number>> {
  return lineIndexOf(parseUnifiedDiff(diff));
}

/** True when some `@@` hunk of the raw diff carries no body line at all. */
function hasEmptyHunk(diff: string): boolean {
  let inHunk = false;
  let body = 0;
  for (const event of walkDiff(diff)) {
    if (event.type === 'line') {
      body++;
      continue;
    }
    if (inHunk && body === 0) return true;
    inHunk = event.type === 'hunk';
    body = 0;
  }
  return inHunk && body === 0;
}

/**
 * A hunk whose declared new-side length is more than one line while its body has no
 * added or context line (only `-` lines, which `hasEmptyHunk` counts as body). Such a
 * hunk passes the empty-hunk check, yet reviewer-core's `buildLineIndex` falls back
 * to the declared `+start,len` range when `newLineNumbers` is empty and would fill
 * a Set of that size. A pure deletion declares `+N,0` and is not flagged. The
 * declared length is not compared with the body otherwise: the fallback only
 * triggers on an empty `newLineNumbers`, and a non-empty one is bounded by the
 * diff's own size.
 */
function findBogusHunk(diff: UnifiedDiff): { file: string; newLines: number } | null {
  for (const f of diff.files) {
    for (const h of f.hunks) {
      if (h.newLines > 1 && (h.newLineNumbers?.length ?? 0) === 0) return { file: f.path, newLines: h.newLines };
    }
  }
  return null;
}

/**
 * True when the inclusive range `[start, end]` shares a line with `lines`. Walks
 * the set, not the range, so its cost never depends on how wide the range is.
 */
export function rangeIntersects(lines: Set<number> | undefined, start: number, end: number): boolean {
  if (!lines) return false;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (const n of lines) if (n >= lo && n <= hi) return true;
  return false;
}

export type PatchPick<T> =
  | { status: 'ok'; row: T }
  /** No stored row carries a patch for the file (EC-4). */
  | { status: 'no_patch' }
  /** Patches exist but none touches the finding's lines: the PR was re-synced (EC-22). */
  | { status: 'stale' };

/**
 * Pick the stored file row whose patch hunks intersect the finding's lines. A PR
 * may hold several rows for one path; rows are tried in id order so the same row
 * is chosen on every request (EC-23).
 */
export function pickPatchRow<T extends { id: string; patch: string | null }>(
  rows: T[],
  path: string,
  startLine: number,
  endLine: number,
): PatchPick<T> {
  const withPatch = rows
    .filter((r) => r.patch !== null && r.patch.trim() !== '')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (withPatch.length === 0) return { status: 'no_patch' };
  for (const row of withPatch) {
    const index = hunkLineIndex(headeredPatch(path, row.patch as string));
    if (rangeIntersects(index.get(path), startLine, endLine)) return { status: 'ok', row };
  }
  return { status: 'stale' };
}

// ---- expectations ----------------------------------------------------------

/**
 * EC-18: why a case's diff / expectation pair cannot be stored, or `null` when it
 * can. The diff needs at least one parseable file hunk, no empty hunk and at most
 * `MAX_DIFF_FILES` files; a `must_find` must
 * intersect the hunk lines (the index the grounding gate uses), otherwise the
 * agent could never pass it. A `must_not_flag` may point anywhere.
 */
export function validateExpectationAgainstDiff(diff: string, expectation: EvalExpectation): string | null {
  const parsed = parseUnifiedDiff(diff);
  if (parsed.files.length > MAX_DIFF_FILES) {
    return `input_diff touches ${parsed.files.length} files: at most ${MAX_DIFF_FILES} files are allowed`;
  }
  if (!parsed.files.some((f) => f.hunks.length > 0)) {
    return 'input_diff has no parseable file hunk: expected a unified diff with diff --git / --- / +++ headers and @@ hunks';
  }
  if (hasEmptyHunk(diff)) {
    return 'input_diff has a hunk with no body lines: every @@ hunk needs at least one context, added or removed line';
  }
  const bogus = findBogusHunk(parsed);
  if (bogus) {
    return `input_diff has a hunk in '${bogus.file}' that declares ${bogus.newLines} new-side lines but holds no added or context line: the declared range must match the hunk body`;
  }
  if (expectation.kind === 'must_find') {
    const lines = lineIndexOf(parsed).get(expectation.file);
    if (!lines) return `expected_output.file '${expectation.file}' is not in the diff`;
    if (!rangeIntersects(lines, expectation.start_line, expectation.end_line)) {
      return `expected_output lines ${expectation.start_line}-${expectation.end_line} do not intersect any diff hunk in '${expectation.file}'`;
    }
  }
  return null;
}

/** AC-13: equal file and inclusive line ranges that overlap. */
export function matches(
  finding: Pick<Finding, 'file' | 'start_line' | 'end_line'>,
  expectation: EvalExpectation,
): boolean {
  if (finding.file !== expectation.file) return false;
  const lo = Math.min(finding.start_line, finding.end_line);
  const hi = Math.max(finding.start_line, finding.end_line);
  return lo <= expectation.end_line && expectation.start_line <= hi;
}

/**
 * The expectation for a case made from a finding: derived from the decision
 * (accepted → `must_find`, dismissed → `must_not_flag`); an undecided finding
 * takes the caller's `kind`. `null` when neither exists (EC-15).
 */
export function expectationFromDecision(
  finding: { file: string; startLine: number; endLine: number; acceptedAt: Date | null; dismissedAt: Date | null },
  bodyKind: EvalExpectationKind | undefined,
): EvalExpectation | null {
  const kind: EvalExpectationKind | undefined = finding.acceptedAt
    ? 'must_find'
    : finding.dismissedAt
      ? 'must_not_flag'
      : bodyKind;
  if (!kind) return null;
  return { kind, file: finding.file, start_line: finding.startLine, end_line: finding.endLine };
}

// ---- scoring ---------------------------------------------------------------

export interface CaseScore {
  pass: boolean;
  /** Findings expected: 1 for `must_find`, 0 for `must_not_flag`. */
  expectedCount: number;
  /** Grounded findings the agent produced for the case. */
  producedCount: number;
}

/** AC-17. */
export function scoreCase(expectation: EvalExpectation, findings: Finding[]): CaseScore {
  const hit = findings.some((f) => matches(f, expectation));
  return {
    pass: expectation.kind === 'must_find' ? hit : !hit,
    expectedCount: expectation.kind === 'must_find' ? 1 : 0,
    producedCount: findings.length,
  };
}

export interface ScoredCase {
  expectation: EvalExpectation;
  findings: Finding[];
  keptCount: number;
  droppedCount: number;
  costUsd: number | null;
}

export interface SuiteScore {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  casesPassed: number;
  casesTotal: number;
  costUsd: number | null;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/**
 * AC-14..AC-16 over a whole run. A metric with a zero denominator is `null`,
 * never 0 or 1 (EC-6).
 *  - recall: `must_find` cases with a matching finding / `must_find` cases
 *  - precision: grounded findings matching no `must_not_flag` of their case / grounded findings
 *  - citation accuracy: kept / (kept + dropped), summed over the run
 */
export function scoreSuite(cases: ScoredCase[]): SuiteScore {
  let mustFind = 0;
  let found = 0;
  let produced = 0;
  let noise = 0;
  let kept = 0;
  let dropped = 0;
  let passed = 0;
  for (const c of cases) {
    const score = scoreCase(c.expectation, c.findings);
    if (score.pass) passed++;
    if (c.expectation.kind === 'must_find') {
      mustFind++;
      if (score.pass) found++;
    }
    produced += c.findings.length;
    if (c.expectation.kind === 'must_not_flag') {
      noise += c.findings.filter((f) => matches(f, c.expectation)).length;
    }
    kept += c.keptCount;
    dropped += c.droppedCount;
  }
  return {
    recall: ratio(found, mustFind),
    precision: ratio(produced - noise, produced),
    citationAccuracy: ratio(kept, kept + dropped),
    casesPassed: passed,
    casesTotal: cases.length,
    costUsd: sumCostOrNull(cases.map((c) => c.costUsd)),
  };
}

/** Total cost, or `null` when any cost is unknown (EC-12) — never a partial sum shown as a total. */
export function sumCostOrNull(costs: (number | null)[]): number | null {
  if (costs.length === 0) return null;
  let total = 0;
  for (const c of costs) {
    if (c === null) return null;
    total += c;
  }
  return total;
}

// ---- prompt / dashboard ----------------------------------------------------

/** The agent's system prompt plus its enabled skill blocks in link order, as sent to the engine (D-18). */
export function effectivePrompt(system: string, skillBlocks: string[]): string {
  return [system, ...skillBlocks].join('\n\n');
}

export type MetricValues = {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
};

const METRICS: EvalMetricName[] = ['recall', 'precision', 'citation_accuracy'];

export const metricsOf = (r: EvalSuiteRunRecord): MetricValues => ({
  recall: r.recall,
  precision: r.precision,
  citation_accuracy: r.citationAccuracy,
});

/** Signed change per metric (fraction); null when either side has no value. */
export function deltas(current: MetricValues, previous: MetricValues): MetricValues {
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  return {
    recall: diff(current.recall, previous.recall),
    precision: diff(current.precision, previous.precision),
    citation_accuracy: diff(current.citation_accuracy, previous.citation_accuracy),
  };
}

const roundPts = (fraction: number) => Math.round(fraction * 1000) / 10;

/**
 * AC-36: every metric that fell by at least a percentage point between the
 * previous and the current `done` run, with the drop in points. `null` when
 * nothing dropped that far. A metric that is null on either side is skipped.
 */
export function regression(
  current: { version: number } & MetricValues,
  previous: MetricValues,
): NonNullable<EvalDashboard['regression']> | null {
  const metrics: { metric: EvalMetricName; drop_pts: number }[] = [];
  for (const metric of METRICS) {
    const now = current[metric];
    const before = previous[metric];
    if (now === null || before === null) continue;
    const dropPts = roundPts(before - now);
    if (dropPts >= REGRESSION_THRESHOLD * 100) metrics.push({ metric, drop_pts: dropPts });
  }
  return metrics.length > 0 ? { version: current.version, metrics } : null;
}

/** Earliest start time a period includes; `null` for all time. */
export function periodCutoff(period: EvalPeriod, now: Date): Date | null {
  const days = PERIOD_DAYS[period];
  return days === null ? null : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// ---- record → DTO ----------------------------------------------------------

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toSuiteRun(r: EvalSuiteRunRecord): EvalSuiteRun {
  return {
    id: r.id,
    agent_id: r.agentId,
    agent_version: r.agentVersion,
    status: r.status,
    started_at: r.startedAt.toISOString(),
    finished_at: iso(r.finishedAt),
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    cases_passed: r.casesPassed,
    cases_total: r.casesTotal,
    cost_usd: r.costUsd,
    error: r.error,
    failing_case: r.failingCaseName,
    model: r.model,
    provider: r.provider,
  };
}

export function toOverviewRun(r: EvalOverviewRunRecord): EvalOverviewRun {
  return { ...toSuiteRun(r), agent_name: r.agentName };
}

export function toTrendPoint(r: EvalSuiteRunRecord): EvalTrendPoint {
  return {
    run_id: r.id,
    ran_at: r.startedAt.toISOString(),
    agent_version: r.agentVersion,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
  };
}

export function toCurrent(r: EvalSuiteRunRecord): NonNullable<EvalDashboard['current']> {
  return {
    run_id: r.id,
    agent_version: r.agentVersion,
    ran_at: r.startedAt.toISOString(),
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    cases_passed: r.casesPassed,
    cases_total: r.casesTotal,
    cost_usd: r.costUsd,
  };
}

export function toCaseResult(r: EvalCaseResultRecord): EvalCaseResult {
  return {
    id: r.id,
    case_id: r.caseId,
    suite_run_id: r.suiteRunId,
    case_name: r.caseName ?? '',
    expected_output: EvalExpectation.parse(r.expected),
    pass: r.pass ?? false,
    expected_count: r.expectedCount,
    produced_count: r.producedCount,
    kept_count: r.keptCount,
    dropped_count: r.droppedCount,
    findings: Array.isArray(r.actualOutput) ? (r.actualOutput as Finding[]) : [],
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    ran_at: r.ranAt.toISOString(),
  };
}

export function toSuiteRunDetail(r: EvalSuiteRunDetailRecord, results: EvalCaseResultRecord[]): EvalSuiteRunDetail {
  return { ...toSuiteRun(r), effective_prompt: r.effectivePrompt, case_results: results.map(toCaseResult) };
}

/** The `{ title, severity, category }` snapshot of a finding-made case; nulls for a hand-made one. */
function caseLabels(meta: unknown): Pick<EvalCase, 'title' | 'severity' | 'category'> {
  const m = (meta ?? {}) as Record<string, unknown>;
  const severity = Severity.safeParse(m.severity);
  const category = FindingCategory.safeParse(m.category);
  return {
    title: typeof m.title === 'string' ? m.title : null,
    severity: severity.success ? severity.data : null,
    category: category.success ? category.data : null,
  };
}

export function toEvalCase(r: EvalCaseRecord, latest: EvalCaseResultRecord | undefined): EvalCase {
  return {
    id: r.id,
    owner_kind: r.ownerKind,
    owner_id: r.ownerId,
    name: r.name,
    input_diff: r.inputDiff ?? '',
    input_files: r.inputFiles ?? null,
    input_meta: r.inputMeta ?? null,
    expected_output: EvalExpectation.parse(r.expectedOutput),
    notes: r.notes,
    created_at: r.createdAt.toISOString(),
    source_finding_id: r.sourceFindingId,
    ...caseLabels(r.inputMeta),
    latest_result: latest ? toCaseResult(latest) : null,
  };
}
