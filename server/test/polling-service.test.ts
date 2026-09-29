/**
 * PollingService with in-memory fakes — no Postgres. Pins: 404 on an unknown
 * repo, a ConfigError from `github()` propagating WITHOUT `touchPolledAt`
 * being called (no partial "polled" state on a failed sync), and the happy
 * path's `{ synced, reviewTriggered: false }` shape.
 */
import { describe, it, expect } from 'vitest';
import type { GitHubClient, PrMeta, RepoRef } from '@devdigest/shared';
import { PollingService } from '../src/modules/polling/service.js';
import { NotFoundError, ConfigError } from '../src/platform/errors.js';

const WS = 'ws-1';
const REPO: RepoRef = { id: 'repo-1', owner: 'acme', name: 'api' };

const PULLS: PrMeta[] = [
  {
    number: 482,
    title: 'Add rate limiting',
    author: 'a',
    branch: 'b',
    base: 'main',
    head_sha: 'h',
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: 'open',
    opened_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
];

describe('PollingService', () => {
  it('404s when the repo is not found in the workspace', async () => {
    const service = new PollingService({
      findRepo: async () => undefined,
      upsertFromGitHub: async () => {},
      touchPolledAt: async () => {},
      github: async () => ({ listPullRequests: async () => PULLS }) as unknown as GitHubClient,
    });

    await expect(service.poll(WS, 'missing')).rejects.toThrow(NotFoundError);
  });

  it('propagates a ConfigError from github() and never calls touchPolledAt', async () => {
    let touched = false;
    const service = new PollingService({
      findRepo: async () => REPO,
      upsertFromGitHub: async () => {},
      touchPolledAt: async () => {
        touched = true;
      },
      github: async () => {
        throw new ConfigError('GITHUB_TOKEN is not configured');
      },
    });

    await expect(service.poll(WS, REPO.id)).rejects.toThrow(ConfigError);
    expect(touched).toBe(false);
  });

  it('happy path: syncs the PR list and bumps last_polled_at', async () => {
    const upserted: { workspaceId: string; repoId: string; prs: PrMeta[] }[] = [];
    const touchedRepoIds: string[] = [];
    const service = new PollingService({
      findRepo: async () => REPO,
      upsertFromGitHub: async (workspaceId, repoId, prs) => {
        upserted.push({ workspaceId, repoId, prs });
      },
      touchPolledAt: async (repoId) => {
        touchedRepoIds.push(repoId);
      },
      github: async () => ({ listPullRequests: async () => PULLS }) as unknown as GitHubClient,
    });

    const result = await service.poll(WS, REPO.id);

    expect(result).toEqual({ synced: 1, reviewTriggered: false });
    expect(upserted).toEqual([{ workspaceId: WS, repoId: REPO.id, prs: PULLS }]);
    expect(touchedRepoIds).toEqual([REPO.id]);
  });
});
