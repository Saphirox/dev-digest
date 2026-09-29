import type { WorkspaceRepoSource } from './ports.js';
import { toWorkspaceRepoSummary, type WorkspaceRepoSummary } from './helpers.js';

export interface WorkspaceServiceDeps {
  repos: WorkspaceRepoSource;
  cloneDir: string;
}

export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: WorkspaceRepoSummary[];
}

/**
 * F1 — workspace service: where clones live + a summary of cloned repos.
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export class WorkspaceService {
  constructor(private deps: WorkspaceServiceDeps) {}

  async get(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.deps.repos.list(workspaceId);
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
      repos: repos.map(toWorkspaceRepoSummary),
    };
  }
}
