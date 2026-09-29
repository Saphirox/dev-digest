import type { RepoRecord } from '../repos/ports.js';

/**
 * F1 — workspace ports. `WorkspaceService` needs only a read of the repos in
 * a workspace (dependency inversion, narrowed with `Pick`-style single
 * method so it can't reach for anything else on `RepoStore`).
 */
export interface WorkspaceRepoSource {
  list(workspaceId: string): Promise<RepoRecord[]>;
}
