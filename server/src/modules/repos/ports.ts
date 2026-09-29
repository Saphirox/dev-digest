/**
 * F1 — repos ports. What consumers of the repos data need, declared next to
 * the repository that implements it (dependency inversion): `RepoRepository
 * implements RepoStore`. The record shape is a structural subset of the
 * Drizzle row, so other modules' `helpers.ts` can stay pure without
 * importing `src/db`.
 */

export interface RepoRecord {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
  createdBy: string | null;
}

export interface InsertRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

export interface RepoStore {
  /** Find a repo in a workspace by its `owner/name` full name (dedupe on add). */
  findByFullName(workspaceId: string, fullName: string): Promise<RepoRecord | undefined>;
  list(workspaceId: string): Promise<RepoRecord[]>;
  getById(workspaceId: string, id: string): Promise<RepoRecord | undefined>;
  insert(values: InsertRepo): Promise<RepoRecord>;
  /** Look up the workspace owning a repo (by repo id, no tenancy scope). */
  workspaceIdFor(repoId: string): Promise<string | null>;
  /** Persist the clone path and bump `last_polled_at` once a clone job completes. */
  updateClonePath(repoId: string, clonePath: string): Promise<void>;
  remove(workspaceId: string, id: string): Promise<boolean>;
  /** Bump `last_polled_at` only (no clone path change) — the manual poll route. */
  touchPolledAt(repoId: string): Promise<void>;
}
