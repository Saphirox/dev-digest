import { Severity, type PrDetail, type PrMeta } from '@devdigest/shared';
import type {
  PullCommitRecord,
  PullFileRecord,
  PullRecord,
  SeverityCountRow,
} from './ports.js';
import { deriveReviewStatus } from './status.js';

/** Pure PR-list / PR-detail transforms — no I/O, unit-tested in isolation. */

export type SeverityBucket = Record<Severity, number>;

/**
 * Fold `(pr, severity, count)` groups into one bucket per PR. A PR with only
 * unknown severities still gets a zeroed bucket (it has findings, just none we
 * chip), matching what the list rendered before the split.
 */
export function severityBuckets(rows: SeverityCountRow[]): Map<string, SeverityBucket> {
  const byPr = new Map<string, SeverityBucket>();
  for (const r of rows) {
    const bucket = byPr.get(r.prId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    const sev = Severity.safeParse(r.severity);
    if (sev.success) bucket[sev.data] += r.count;
    byPr.set(r.prId, bucket);
  }
  return byPr;
}

/** GitHub's PR-list payload has no diff stats, so fresh imports land zeroed. */
export function needsDiffStats(pr: Pick<PullRecord, 'additions' | 'deletions' | 'filesCount'>): boolean {
  return pr.additions === 0 && pr.deletions === 0 && pr.filesCount === 0;
}

export interface PrListRollup {
  score: number | null;
  costUsd: number | null;
  findings: SeverityBucket | null;
}

export function toPrMeta(pr: PullRecord, rollup: PrListRollup, now: number): PrMeta {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: deriveReviewStatus({
      ghStatus: pr.status,
      lastReviewedSha: pr.lastReviewedSha,
      headSha: pr.headSha,
      updatedAt: pr.updatedAt,
      now,
    }),
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    score: rollup.score,
    cost_usd: rollup.costUsd,
    findings: rollup.findings,
  };
}

/** PR detail served from the local mirror when GitHub is unreachable. */
export function toPersistedPrDetail(
  pr: PullRecord,
  files: PullFileRecord[],
  commits: PullCommitRecord[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
