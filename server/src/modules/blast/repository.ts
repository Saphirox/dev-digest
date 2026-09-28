import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPrFile, BlastPull, BlastRepoRef, BlastStore } from './ports.js';

/**
 * Blast data access: `pull_requests`, `pr_files`, `repos` — its own reads,
 * never `reviews`' or `repo-intel`'s repository (see the plan's Architecture
 * constraints). Every query is workspace-scoped.
 */
export class BlastRepository implements BlastStore {
  constructor(private db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<BlastPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listChangedFiles(prId: string): Promise<BlastPrFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async findRepo(workspaceId: string, repoId: string): Promise<BlastRepoRef | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }
}
