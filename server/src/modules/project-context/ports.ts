import type { ProjectContextEntry } from '@devdigest/shared';

/**
 * Project Context ports. What `ProjectContextService` needs from the outside
 * world, declared next to it (dependency inversion): the file system
 * (`DocSource`), the tokenizer, the clone location/HEAD (`CloneLocator`) and the
 * repo lookup are all passed in; tests use fakes. The container wires the real
 * adapters.
 */

export interface DocEntry {
  /** Posix path relative to the clone root. */
  path: string;
  size: number;
}

export interface DocSource {
  /**
   * Files under `root` matching `glob`, sorted by path. `null` when `root` does
   * not exist (the repository has no clone).
   */
  list(root: string, glob: string): Promise<DocEntry[] | null>;
  /**
   * File text, or `null` when unsafe (symlink anywhere on the path, `.git`,
   * outside the root) or unreadable. With `maxBytes`, at most that many bytes
   * are read (a prefix), so a huge file never lands in memory whole.
   */
  read(root: string, relPath: string, maxBytes?: number): Promise<string | null>;
}

export interface TokenCounter {
  count(text: string): number;
  truncate(text: string, max: number): { text: string; total: number };
}

export interface ProjectContextRepo {
  id: string;
  owner: string;
  name: string;
}

export interface CloneLocator {
  /** Directory of the repository's clone (it may not exist). */
  rootFor(repo: ProjectContextRepo): string;
  /** Current HEAD sha of the clone; rejects when unavailable. */
  head(repo: ProjectContextRepo): Promise<string>;
}

export interface RepoLookup {
  /** Workspace-scoped repo lookup (tenancy guard). */
  find(workspaceId: string, repoId: string): Promise<ProjectContextRepo | undefined>;
}

/** A document handed to the review engine (structurally reviewer-core's `ProjectDoc`). */
export interface RunDoc {
  path: string;
  content: string;
}

export interface ProjectContextRun {
  /** Injected documents in run order (empty when every path was missing/dropped). */
  docs: RunDoc[];
  /** Every attached path with its outcome. */
  entries: ProjectContextEntry[];
  /** Injected paths in order, then `missing` paths (trace "Specs read"). */
  specsRead: string[];
  /** Sum of injected content tokens. */
  specsTokens: number;
  /** Clone HEAD the docs were read at; null when unknown or not cloned. */
  sha: string | null;
  /** True when the repository has no clone on disk (EC-9). */
  notCloned: boolean;
  /** Attached paths that could not be read (EC-4). */
  missing: string[];
}
