import { and, count, desc, eq, inArray, isNull, sum } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  DiffStats,
  PullCommitRecord,
  PullFileRecord,
  PullRecord,
  PullsStore,
  RepoRef,
  SeverityCountRow,
} from './ports.js';

/**
 * F1 — pulls data-access layer. The only place in the module that touches
 * `pull_requests`, `pr_files`, `pr_commits`, and the list's read-time rollups
 * over `reviews` / `findings` / `agent_runs`.
 */
export class PullsRepository implements PullsStore {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async findPull(workspaceId: string, prId: string): Promise<PullRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async upsertFromGitHub(workspaceId: string, repoId: string, prs: PrMeta[]): Promise<void> {
    for (const pr of prs) {
      await this.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: pr.title,
            headSha: pr.head_sha,
            status: pr.status,
            updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          },
        });
    }
  }

  async listByRepo(repoId: string): Promise<PullRecord[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  async latestScores(prIds: string[]): Promise<Map<string, number | null>> {
    if (prIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.reviews.prId], { prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(t.reviews.prId, desc(t.reviews.createdAt));
    return new Map(rows.map((r) => [r.prId, r.score]));
  }

  async completedCostTotals(prIds: string[]): Promise<Map<string, number | null>> {
    if (prIds.length === 0) return new Map();
    // Postgres SUM already encodes the cost rule: NULL costs are skipped, and
    // a group whose costs are ALL NULL sums to NULL (unknown), never 0. A PR
    // with no `done` run produces no group at all.
    const rows = await this.db
      .select({ prId: t.agentRuns.prId, total: sum(t.agentRuns.costUsd).mapWith(Number) })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
      .groupBy(t.agentRuns.prId);
    const totals = new Map<string, number | null>();
    for (const r of rows) if (r.prId) totals.set(r.prId, r.total);
    return totals;
  }

  async openFindingCounts(prIds: string[]): Promise<SeverityCountRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.reviews.prId, severity: t.findings.severity, count: count() })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.prId, prIds), isNull(t.findings.dismissedAt)))
      .groupBy(t.reviews.prId, t.findings.severity);
  }

  async replaceDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (detail.files.length > 0) {
      await this.db.insert(t.prFiles).values(
        detail.files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (detail.commits.length > 0) {
      await this.db.insert(t.prCommits).values(
        detail.commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
    }
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // the detail fetch so the Pull Requests list shows real size/files.
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  async loadFilesAndCommits(
    prId: string,
  ): Promise<{ files: PullFileRecord[]; commits: PullCommitRecord[] }> {
    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const commits = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return { files, commits };
  }
}
