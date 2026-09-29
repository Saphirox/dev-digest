import { NotFoundError } from '../../platform/errors.js';
import type { PollingDeps } from './ports.js';

/**
 * F1 — polling service. MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates) and bumps `last_polled_at`. It
 * does NOT trigger any review — review is manual (user presses Run Review).
 *
 * Routed through `PullsRepository.upsertFromGitHub` (not a hand copy) so this
 * import path can never drift from the one `GET /repos/:id/pulls` uses (see
 * `server/INSIGHTS.md` 2026-09-28).
 */
export class PollingService {
  constructor(private deps: PollingDeps) {}

  async poll(workspaceId: string, repoId: string): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.deps.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    await this.deps.upsertFromGitHub(workspaceId, repo.id, pulls);
    await this.deps.touchPolledAt(repo.id);

    // NOTE: no review is triggered here — manual trigger only.
    return { synced: pulls.length, reviewTriggered: false };
  }
}
