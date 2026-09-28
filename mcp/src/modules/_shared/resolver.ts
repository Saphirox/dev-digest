import type { LookupStore, AgentRef } from './ports.js';
import { RepoNotFound, PrNotFound, AgentNotFound, AgentAmbiguous } from '../../platform/errors.js';

/**
 * `GET /repos/:id/pulls` syncs from GitHub on every call (`pulls/service.ts:36-53`)
 * — slow. `Resolver` caches `owner/name#n → prId` for the lifetime of the
 * process (one instance, built in `platform/container.ts`), so a second call
 * for the same PR is free. Used directly by every module's `service.ts` that
 * needs repo/PR/agent resolution (`reviews`, `conventions`) — shared
 * application-level code, not a per-module concern.
 */
export class Resolver {
  private readonly prCache = new Map<string, string>();

  constructor(private readonly store: LookupStore) {}

  async resolveRepo(repo: string): Promise<{ id: string; full_name: string }> {
    const repos = await this.store.listRepos();
    const match = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
    if (!match) {
      throw new RepoNotFound(
        repo,
        repos.map((r) => r.full_name).slice(0, 10),
      );
    }
    return match;
  }

  /** Resolves `owner/name#n` to a PR id, using (and filling) the process cache. */
  async resolvePr(repo: string, repoId: string, pr: number): Promise<string> {
    const cacheKey = `${repo.toLowerCase()}#${pr}`;
    const cached = this.prCache.get(cacheKey);
    if (cached) return cached;

    const pulls = await this.store.listPulls(repoId);
    const match = pulls.find((p) => p.number === pr && p.id != null);
    if (!match || match.id == null) {
      throw new PrNotFound(
        repo,
        pr,
        pulls.map((p) => p.number).slice(0, 10),
      );
    }
    this.prCache.set(cacheKey, match.id);
    return match.id;
  }

  /**
   * Evicts a cached `owner/name#n → prId` entry so the next `resolvePr` call
   * re-fetches it. A service calls this when a downstream API call made with
   * the cached id comes back not-found (`ApiFailure` 404) — the PR may have
   * been deleted, or the cache entry is otherwise stale.
   */
  invalidatePr(repo: string, pr: number): void {
    this.prCache.delete(`${repo.toLowerCase()}#${pr}`);
  }

  /**
   * Exact id match, else exact case-insensitive name match, else a unique
   * case-insensitive substring match. Ambiguous/missing throw typed errors so
   * `modules/_shared/messages.ts` can point back at `list_agents`.
   */
  async resolveAgent(agent: string): Promise<AgentRef> {
    const agents = await this.store.listAgents();

    const byId = agents.find((a) => a.id === agent);
    if (byId) return byId;

    const needle = agent.toLowerCase();
    const byExactName = agents.find((a) => a.name.toLowerCase() === needle);
    if (byExactName) return byExactName;

    const bySubstring = agents.filter((a) => a.name.toLowerCase().includes(needle));
    if (bySubstring.length === 1) return bySubstring[0]!;
    if (bySubstring.length > 1) {
      throw new AgentAmbiguous(
        agent,
        bySubstring.map((a) => a.name),
      );
    }

    throw new AgentNotFound(agent);
  }
}
