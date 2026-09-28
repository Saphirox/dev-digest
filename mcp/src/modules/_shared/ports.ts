/**
 * `_shared` ports — what `resolver.ts` needs from the outside world, declared
 * next to it (dependency inversion): `LookupApiRepository` implements
 * `LookupStore`; tests pass a fake. Every field is a structural subset of the
 * real API response — only what resolution reads, same rule as every
 * module's own `ports.ts`.
 */

export interface RepoRecord {
  id: string;
  full_name: string;
}

export interface PullRecord {
  id: string | null | undefined;
  number: number;
}

/** Just enough of an agent to resolve `agent` input to an id + display name. */
export interface AgentRef {
  id: string;
  name: string;
}

export interface LookupStore {
  /** `GET /repos` */
  listRepos(): Promise<RepoRecord[]>;
  /** `GET /repos/:id/pulls` */
  listPulls(repoId: string): Promise<PullRecord[]>;
  /** `GET /agents` */
  listAgents(): Promise<AgentRef[]>;
}
