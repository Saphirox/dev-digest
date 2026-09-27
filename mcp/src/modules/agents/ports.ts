/**
 * `agents` ports. What `AgentsService` needs from the outside world, declared
 * next to the service that uses it (dependency inversion): `AgentsApiRepository`
 * implements `AgentsStore`; tests pass a fake.
 */

// No `provider` field: `helpers.ts`'s `toAgentItem` never reads it (contracts
// hygiene, 2026-09-26 — a record shape only carries fields the module reads).
// The API still returns it; `repository.ts`'s `.passthrough()` schema lets it
// through unvalidated, just untyped here.
export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  model: string;
  enabled: boolean;
}

export interface AgentsStore {
  /** `GET /agents` */
  listAgents(): Promise<AgentRecord[]>;
}
