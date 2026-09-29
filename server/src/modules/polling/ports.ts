import type { GitHubClient } from '@devdigest/shared';
import type { PullsStore } from '../pulls/ports.js';
import type { RepoStore } from '../repos/ports.js';

/**
 * F1 — polling ports. `PollingService` needs only a slice of the `pulls` and
 * `repos` stores (dependency inversion, narrowed with `Pick` so it can't
 * accidentally reach for an unrelated method) plus a way to resolve the
 * GitHub client lazily (route wires it to `() => container.github()`).
 */
export interface PollingDeps {
  findRepo: PullsStore['findRepo'];
  upsertFromGitHub: PullsStore['upsertFromGitHub'];
  touchPolledAt: RepoStore['touchPolledAt'];
  github: () => Promise<GitHubClient>;
}
