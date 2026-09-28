import type { BlastResult } from '../repo-intel/types.js';

/**
 * Blast module ports. What `BlastService` needs from the outside world,
 * declared next to it (dependency inversion): the DB (`BlastStore`), the
 * repo-intel facade (`BlastIndex`), GitHub (`PriorPrSource`) and an
 * in-memory cache (`PriorPrCache`) are all passed in; tests use fakes.
 */

export interface BlastPull {
  id: string;
  repoId: string;
  number: number;
  headSha: string;
}

export interface BlastPrFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface BlastRepoRef {
  owner: string;
  name: string;
}

export interface BlastStore {
  /** Workspace-scoped PR lookup (tenancy guard). */
  findPull(workspaceId: string, prId: string): Promise<BlastPull | undefined>;
  listChangedFiles(prId: string): Promise<BlastPrFile[]>;
  /** Workspace-scoped repo lookup (tenancy guard). */
  findRepo(workspaceId: string, repoId: string): Promise<BlastRepoRef | undefined>;
}

/** The repo-intel facade, narrowed to what blast reads. */
export interface BlastIndex {
  getBlastRadius(repoId: string, files: string[]): Promise<BlastResult>;
  /** The index's `lastIndexedSha`, or `null` when the repo has no index row. */
  getIndexedSha(repoId: string): Promise<string | null>;
}

/** One PR associated with a candidate commit (GitHub). */
export interface PriorPrCandidate {
  number: number;
  title: string;
  author: string;
  merged_at: string | null;
}

/**
 * GitHub reads for "Prior PRs touching these files" — a narrowed slice of
 * `GitHubClient` (`server/src/vendor/shared/adapters.ts`), so any real
 * `GitHubClient` (or `MockGitHubClient`) satisfies this structurally.
 */
export interface PriorPrClient {
  listCommitShasForPath(repo: BlastRepoRef, path: string, limit: number): Promise<string[]>;
  listPullsForCommit(repo: BlastRepoRef, sha: string): Promise<PriorPrCandidate[]>;
}

/**
 * Resolves the GitHub port. `getPriorPrs` calls `resolve()` exactly ONCE, up
 * front, before its per-file/per-commit retry loops — a missing token throws
 * the container's own `ConfigError` here, so that throw propagates as itself
 * instead of being swallowed by the per-call failure counter (`totalFailures`)
 * the retry loops use for real GitHub API failures (network, 404, rate limit).
 */
export interface PriorPrSource {
  resolve(): Promise<PriorPrClient>;
}

/** A small key/value cache with bounded size (see `cache.ts`'s `BoundedCache`). */
export interface PriorPrCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
}
