import type { ConventionsStore } from './ports.js';
import type { Resolver } from '../_shared/resolver.js';
import { selectConventions, toConventionItem, type ConventionOutputItem } from './helpers.js';

export interface GetConventionsResult {
  repo: string;
  last_scan_at: string | null;
  conventions: ConventionOutputItem[];
  more: number;
}

export interface ConventionsServiceDeps {
  store: ConventionsStore;
  resolver: Resolver;
}

/**
 * `conventions` service. Constructor takes a named deps type (dependency
 * inversion), consistently with `AgentsServiceDeps`/`ReviewsServiceDeps`.
 */
export class ConventionsService {
  constructor(private readonly deps: ConventionsServiceDeps) {}

  /** `get_conventions` — all statuses, accepted first, never triggers extraction. */
  async getConventions(input: { repo: string }): Promise<GetConventionsResult> {
    const repo = await this.deps.resolver.resolveRepo(input.repo);
    const list = await this.deps.store.listConventions(repo.id);
    const selected = selectConventions(list.conventions);

    return {
      repo: repo.full_name,
      last_scan_at: list.last_scan_at,
      conventions: selected.map(toConventionItem),
      more: Math.max(0, list.conventions.length - selected.length),
    };
  }
}
