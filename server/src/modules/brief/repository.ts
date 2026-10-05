import { and, eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BriefFile, BriefIntent, BriefPull, BriefRepoRef, BriefStore } from './ports.js';
import { hunkRanges } from './helpers.js';

/**
 * Brief data access: `pull_requests`, `pr_files`, `repos`, `pr_intent`,
 * `pr_brief` — its own reads, never `reviews`' or `repo-intel`'s repository.
 * Queries that take a workspace are workspace-scoped.
 */
export class BriefRepository implements BriefStore {
  constructor(private db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async findRepo(workspaceId: string, repoId: string): Promise<BriefRepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * Path, counts and the hunks' new-side line RANGES. The patch is read only to
   * parse its `@@` headers here; its text never leaves this method, so nothing
   * from the diff body reaches the model (NFR-1).
   */
  async listFiles(prId: string): Promise<BriefFile[]> {
    const rows = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map(({ patch, ...f }) => ({ ...f, changedLines: hunkRanges(patch) }));
  }

  async getIntent(prId: string): Promise<BriefIntent | undefined> {
    const [row] = await this.db
      .select({ intent: t.prIntent.intent, inScope: t.prIntent.inScope, outOfScope: t.prIntent.outOfScope })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return row;
  }

  async getBrief(workspaceId: string, prId: string): Promise<PrBrief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!row) return null;
    // A row written by an older shape no longer parses: treat it as no brief.
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async upsertBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
