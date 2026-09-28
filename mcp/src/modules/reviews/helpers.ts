/**
 * Pure select/verdict/shape helpers — no I/O. Shared by `get_findings`'s and
 * `run_agent_on_pr`'s `ReviewsService` methods so both tools trim the same
 * way (Token budget in the plan). Model-facing line rendering lives in
 * `render.ts` (presentation ring), not here.
 */
import type { FindingRecord, ReviewRecord, Severity, Verdict } from './ports.js';
import { RATIONALE_MAX, SUGGESTION_MAX } from './constants.js';
import { truncate } from '../../lib/text.js';

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

export type LowerSeverity = 'critical' | 'warning' | 'suggestion';

function toLowerSeverity(s: Severity): LowerSeverity {
  return s.toLowerCase() as LowerSeverity;
}

/** One line per finding, used for both the summary and full item shapes. */
export interface SummaryFindingItem {
  severity: LowerSeverity;
  file: string;
  line: number;
  title: string;
  agent?: string;
}

export interface FullFindingItem extends SummaryFindingItem {
  end_line: number;
  category: string;
  rationale: string;
  suggestion: string | null;
}

export function toSummaryItem(f: FindingRecord, agent?: string): SummaryFindingItem {
  return {
    severity: toLowerSeverity(f.severity),
    file: f.file,
    line: f.start_line,
    title: f.title,
    ...(agent ? { agent } : {}),
  };
}

export function toFullItem(f: FindingRecord, agent?: string): FullFindingItem {
  return {
    ...toSummaryItem(f, agent),
    end_line: f.end_line,
    category: f.category,
    rationale: truncate(f.rationale, RATIONALE_MAX),
    suggestion: f.suggestion ? truncate(f.suggestion, SUGGESTION_MAX) : null,
  };
}

/** CRITICAL > WARNING > SUGGESTION, then file, then line — shared by every sort below. */
function compareFindings(a: FindingRecord, b: FindingRecord): number {
  const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (bySeverity !== 0) return bySeverity;
  const byFile = a.file.localeCompare(b.file);
  if (byFile !== 0) return byFile;
  return a.start_line - b.start_line;
}

/**
 * Drop dismissed findings (same rule as the PR list, `PrMeta.findings`),
 * keep only `severity >= minSeverity`, sort CRITICAL > WARNING > SUGGESTION
 * then file, then line, and slice to `limit`.
 */
export function selectFindings(
  findings: FindingRecord[],
  opts: { minSeverity?: Severity; limit?: number } = {},
): FindingRecord[] {
  const minRank = opts.minSeverity ? SEVERITY_RANK[opts.minSeverity] : 0;
  const kept = findings.filter((f) => f.dismissed_at == null && SEVERITY_RANK[f.severity] >= minRank);
  kept.sort(compareFindings);
  return opts.limit != null ? kept.slice(0, opts.limit) : kept;
}

/** Per-severity counts of the (already-filtered, non-dismissed) findings. */
export function counts(findings: FindingRecord[]): {
  critical: number;
  warning: number;
  suggestion: number;
} {
  const result = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.dismissed_at != null) continue;
    if (f.severity === 'CRITICAL') result.critical += 1;
    else if (f.severity === 'WARNING') result.warning += 1;
    else result.suggestion += 1;
  }
  return result;
}

const VERDICT_RANK: Record<Verdict, number> = {
  request_changes: 2,
  comment: 1,
  approve: 0,
};

/** The most severe verdict across reviews (`request_changes` > `comment` > `approve`). */
export function worstVerdict(reviews: { verdict: Verdict | null }[]): Verdict | null {
  let worst: Verdict | null = null;
  for (const r of reviews) {
    if (r.verdict == null) continue;
    if (worst == null || VERDICT_RANK[r.verdict] > VERDICT_RANK[worst]) worst = r.verdict;
  }
  return worst;
}

/** One `ReviewRecord` per `agent_id`, keeping the one with the latest `created_at`. */
export function latestPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const byAgent = new Map<string, ReviewRecord>();
  for (const r of reviews) {
    const key = r.agent_id ?? r.id;
    const existing = byAgent.get(key);
    if (!existing || r.created_at > existing.created_at) byAgent.set(key, r);
  }
  return Array.from(byAgent.values());
}

/** `get_findings`/`run_agent_on_pr` "reviews" row: one line per completed agent run. */
export interface ReviewSummaryItem {
  agent: string | null;
  run_id: string | null;
  verdict: Verdict | null;
  score: number | null;
}

export interface FindingsPayload {
  verdict: Verdict | null;
  reviews: ReviewSummaryItem[];
  counts: { critical: number; warning: number; suggestion: number };
  findings: (SummaryFindingItem | FullFindingItem)[];
  more: number;
}

/**
 * Combines one or more `ReviewRecord`s (one per agent run) into the shape
 * `get_findings`/`run_agent_on_pr` return: overall counts/verdict cover every
 * non-dismissed finding, `findings`/`more` reflect the `minSeverity`+`limit`
 * trim applied to the merged, re-sorted list (each item tagged with the
 * agent that produced it).
 */
export function buildFindingsPayload(
  reviews: ReviewRecord[],
  opts: { minSeverity?: Severity; limit: number; detail: 'summary' | 'full' },
): FindingsPayload {
  const reviewSummaries: ReviewSummaryItem[] = reviews.map((r) => ({
    agent: r.agent_name ?? null,
    run_id: r.run_id,
    verdict: r.verdict,
    score: r.score,
  }));

  const minRank = opts.minSeverity ? SEVERITY_RANK[opts.minSeverity] : 0;
  const allFindings: FindingRecord[] = [];
  const tagged: { finding: FindingRecord; agent: string | null }[] = [];
  for (const r of reviews) {
    for (const f of r.findings) {
      allFindings.push(f);
      if (f.dismissed_at == null && SEVERITY_RANK[f.severity] >= minRank) {
        tagged.push({ finding: f, agent: r.agent_name ?? null });
      }
    }
  }
  tagged.sort((a, b) => compareFindings(a.finding, b.finding));
  const sliced = tagged.slice(0, opts.limit);
  const items = sliced.map((t) =>
    opts.detail === 'full'
      ? toFullItem(t.finding, t.agent ?? undefined)
      : toSummaryItem(t.finding, t.agent ?? undefined),
  );

  return {
    verdict: worstVerdict(reviews),
    reviews: reviewSummaries,
    counts: counts(allFindings),
    findings: items,
    more: Math.max(0, tagged.length - sliced.length),
  };
}
