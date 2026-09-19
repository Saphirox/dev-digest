/**
 * Pure PR-list / PR-detail transforms (`modules/pulls/helpers.ts`): severity
 * bucketing for the FINDINGS column, the zeroed-diff-stats check that drives
 * the backfill, and the row → contract mappers.
 */
import { describe, it, expect } from 'vitest';
import {
  needsDiffStats,
  severityBuckets,
  toPersistedPrDetail,
  toPrMeta,
} from '../src/modules/pulls/helpers.js';
import type { PullRecord } from '../src/modules/pulls/ports.js';

const pr: PullRecord = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  branch: 'feat/rl',
  base: 'main',
  headSha: 'abc',
  lastReviewedSha: null,
  additions: 3,
  deletions: 1,
  filesCount: 2,
  status: 'open',
  body: null,
  openedAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: null,
};

describe('severityBuckets', () => {
  it('folds (pr, severity, count) groups into one bucket per PR', () => {
    const byPr = severityBuckets([
      { prId: 'a', severity: 'CRITICAL', count: 2 },
      { prId: 'a', severity: 'SUGGESTION', count: 1 },
      { prId: 'b', severity: 'WARNING', count: 4 },
    ]);
    expect(byPr.get('a')).toEqual({ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 });
    expect(byPr.get('b')).toEqual({ CRITICAL: 0, WARNING: 4, SUGGESTION: 0 });
  });

  it('gives a PR with only unknown severities a zeroed bucket, not a missing one', () => {
    expect(severityBuckets([{ prId: 'a', severity: 'INFO', count: 3 }]).get('a')).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    });
  });
});

describe('needsDiffStats', () => {
  it('is true only when additions, deletions and files are all zero', () => {
    expect(needsDiffStats({ additions: 0, deletions: 0, filesCount: 0 })).toBe(true);
    expect(needsDiffStats({ additions: 0, deletions: 0, filesCount: 1 })).toBe(false);
  });
});

describe('toPrMeta', () => {
  it('maps the row and carries the rollups through, keeping null as null', () => {
    const meta = toPrMeta(pr, { score: null, costUsd: null, findings: null }, Date.now());
    expect(meta).toMatchObject({
      id: 'pr-1',
      head_sha: 'abc',
      files_count: 2,
      status: 'needs_review',
      opened_at: '2026-06-01T00:00:00.000Z',
      updated_at: null,
      score: null,
      cost_usd: null,
      findings: null,
    });
  });
});

describe('toPersistedPrDetail', () => {
  it('maps files and commits from the local mirror', () => {
    const detail = toPersistedPrDetail(
      pr,
      [{ path: 'a.ts', additions: 1, deletions: 0, patch: null }],
      [{ sha: 's1', message: 'm', author: 'x', committedAt: null }],
    );
    expect(detail.files).toEqual([{ path: 'a.ts', additions: 1, deletions: 0, patch: null }]);
    expect(detail.commits).toEqual([{ sha: 's1', message: 'm', author: 'x', committed_at: null }]);
    expect(detail.status).toBe('open');
  });
});
