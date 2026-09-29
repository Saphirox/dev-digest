import type { RepoRecord } from '../repos/ports.js';

/**
 * F1 — workspace pure helpers. No I/O, no DB, no container.
 */

export interface WorkspaceRepoSummary {
  id: string;
  full_name: string;
  clone_path: string | null;
  last_polled_at: string | null;
  cloned: boolean;
}

/** Map a persisted repo row to the workspace overview's repo summary shape. */
export function toWorkspaceRepoSummary(r: RepoRecord): WorkspaceRepoSummary {
  return {
    id: r.id,
    full_name: r.fullName,
    clone_path: r.clonePath,
    last_polled_at: r.lastPolledAt?.toISOString() ?? null,
    cloned: Boolean(r.clonePath),
  };
}
