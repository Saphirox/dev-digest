import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * Conventions ports. What ConventionsService needs from the outside world,
 * declared next to it (dependency inversion): the Drizzle repository, the
 * repo's files, and the extraction model are all passed in; tests use fakes.
 */

export interface RepoRef {
  id: string;
  owner: string;
  name: string;
}

export interface ConventionRecord {
  id: string;
  rule: string;
  category: ConventionCategory;
  rationale: string | null;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceLine: number | null;
  confidence: number | null;
  occurrences: number | null;
  status: ConventionStatus;
  createdAt: Date;
}

export type NewConvention = Omit<ConventionRecord, 'id' | 'status' | 'createdAt'> & { pattern: string | null };

export interface ScanMeta {
  sampledFiles: number;
  at: Date;
}

export interface ConventionPatchRecord {
  rule?: string;
  category?: ConventionCategory;
  status?: ConventionStatus;
}

export interface ConventionsStore {
  /** Workspace-scoped repo lookup (tenancy guard). */
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  /** Newest first. */
  list(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  /** Replace the repo's PENDING rows with `rows`; accepted/rejected ones stay. */
  replacePending(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void>;
  update(workspaceId: string, id: string, patch: ConventionPatchRecord): Promise<ConventionRecord | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  getScanMeta(workspaceId: string, repoId: string): Promise<ScanMeta | null>;
  saveScanMeta(workspaceId: string, repoId: string, meta: ScanMeta): Promise<void>;
}

/** The cloned repo, as the extractor sees it. */
export interface RepoSource {
  /** Top-ranked source files (paths); [] when the repo isn't indexed. */
  topFiles(repoId: string, n: number): Promise<string[]>;
  /** File contents; '' or a throw when missing. */
  readFile(repo: RepoRef, path: string): Promise<string>;
  /** Distinct files matching a pattern; null when the search can't run. */
  countFiles(repo: RepoRef, pattern: string): Promise<number | null>;
}

/** One candidate as the model returns it (unverified). */
export interface RawCandidate {
  rule: string;
  rationale: string | null;
  evidence_path: string;
  evidence_line: number;
  evidence_snippet: string;
  pattern: string | null;
  category: ConventionCategory;
  confidence: number;
}

export interface ExtractorModel {
  extract(
    workspaceId: string,
    input: { repoName: string; sample: string },
  ): Promise<{ candidates: RawCandidate[]; model: string; costUsd: number | null }>;
}
