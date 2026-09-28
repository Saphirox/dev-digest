import type { AgentsStore } from './ports.js';
import { type AgentItem, toAgentItem } from './helpers.js';

export interface ListAgentsResult {
  agents: AgentItem[];
}

export interface AgentsServiceDeps {
  store: AgentsStore;
}

/** `agents` service. Constructor takes a named deps type (dependency inversion), consistently with `ReviewsServiceDeps`/`ConventionsServiceDeps`. */
export class AgentsService {
  constructor(private readonly deps: AgentsServiceDeps) {}

  /** `list_agents` — never returns the system prompt (`toAgentItem` drops it). */
  async listAgents(): Promise<ListAgentsResult> {
    const agents = await this.deps.store.listAgents();
    return { agents: agents.map(toAgentItem) };
  }
}
