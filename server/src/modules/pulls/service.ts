import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { Logger, PullRecord, PullsStore, RepoRef } from './ports.js';
import { BACKFILL_LIMIT } from './constants.js';
import { needsDiffStats, severityBuckets, toPersistedPrDetail, toPrMeta } from './helpers.js';

export interface PullsServiceDeps {
  store: PullsStore;
  /** Resolves the GitHub client; rejects when no token is configured. */
  github: () => Promise<GitHubClient>;
  log: Logger;
}

/**
 * F1 — pulls service. PR import + reads, local-first: GitHub is consulted when
 * a token is configured, but a missing token or an offline GitHub never fails
 * a read — already-imported/seeded PRs stay viewable.
 *
 * Inline review comments are proxied live to GitHub (no local persistence), so
 * the Files-changed tab stays in lock-step with GitHub.
 */
export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const { store, log } = this.deps;
    const repo = await store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await this.deps.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await store.upsertFromGitHub(workspaceId, repo.id, pulls);
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await store.listByRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows);

    // Read-time rollups for the list's SCORE / COST / FINDINGS columns — no FK
    // denorm; one grouped query each over the page's PRs.
    const prIds = rows.map((r) => r.id);
    const [scores, costs, findingRows] = await Promise.all([
      store.latestScores(prIds),
      store.completedCostTotals(prIds),
      store.openFindingCounts(prIds),
    ]);
    const findings = severityBuckets(findingRows);

    const now = Date.now();
    return rows.map((r) =>
      toPrMeta(
        r,
        {
          score: scores.get(r.id) ?? null,
          costUsd: costs.get(r.id) ?? null,
          findings: findings.get(r.id) ?? null,
        },
        now,
      ),
    );
  }

  async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { store, log } = this.deps;
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await store.replaceDetail(pr.id, detail);
      return { ...detail, id: pr.id };
    } catch (err) {
      log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const { files, commits } = await store.loadFilesAndCommits(pr.id);
      return toPersistedPrDetail(pr, files, commits);
    }
  }

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { log } = this.deps;
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  /**
   * Backfill zeroed diff stats from the detail endpoint, capped per request.
   * Mutates `rows` in place so this response already shows the real numbers.
   */
  private async backfillDiffStats(gh: GitHubClient, repo: RepoRef, rows: PullRecord[]) {
    const needStats = rows.filter(needsDiffStats).slice(0, BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.deps.store.updateDiffStats(r.id, stats);
        Object.assign(r, stats);
      } catch (err) {
        this.deps.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.deps.store.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.store.findRepo(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }
}
