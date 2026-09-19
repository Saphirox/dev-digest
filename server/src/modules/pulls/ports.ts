import type { PrDetail, PrMeta } from '@devdigest/shared';

/**
 * F1 — pulls ports. What PullsService needs from the outside world, declared
 * next to the service that uses it (dependency inversion): PullsRepository
 * implements PullsStore; tests pass a fake.
 *
 * The record shapes are structural subsets of the Drizzle rows, so helpers.ts
 * can stay pure without importing `src/db`.
 */

export interface RepoRef {
  id: string;
  owner: string;
  name: string;
}

export interface PullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state (open/merged/closed), not the derived review status. */
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface PullFileRecord {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PullCommitRecord {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** One `(pr, severity)` group of non-dismissed findings. */
export interface SeverityCountRow {
  prId: string;
  severity: string;
  count: number;
}

export interface PullsStore {
  /** Workspace-scoped repo lookup (tenancy guard). */
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  /** Workspace-scoped PR lookup (tenancy guard). */
  findPull(workspaceId: string, prId: string): Promise<PullRecord | undefined>;
  /** Idempotent import of GitHub's PR list (unique repo_id + number). */
  upsertFromGitHub(workspaceId: string, repoId: string, prs: PrMeta[]): Promise<void>;
  listByRepo(repoId: string): Promise<PullRecord[]>;
  updateDiffStats(prId: string, stats: DiffStats): Promise<void>;
  /** Latest `kind='review'` score per PR; PRs never reviewed are absent. */
  latestScores(prIds: string[]): Promise<Map<string, number | null>>;
  /**
   * Summed cost of every `done` run per PR. Null = unknown (every completed
   * run lacks a cost); PRs with no completed run are absent. Never 0-for-null.
   */
  completedCostTotals(prIds: string[]): Promise<Map<string, number | null>>;
  /** Non-dismissed findings across every review of each PR, grouped by severity. */
  openFindingCounts(prIds: string[]): Promise<SeverityCountRow[]>;
  /** Replace the persisted files/commits and refresh body + diff stats from a GitHub detail fetch. */
  replaceDetail(prId: string, detail: PrDetail): Promise<void>;
  loadFilesAndCommits(
    prId: string,
  ): Promise<{ files: PullFileRecord[]; commits: PullCommitRecord[] }>;
}

export interface Logger {
  warn(obj: object, msg: string): void;
}
