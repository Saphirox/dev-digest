/** Pure select/shape helpers — no I/O. */
import type { AgentRecord } from './ports.js';
import { AGENT_DESCRIPTION_MAX } from './constants.js';
import { truncate } from '../../lib/text.js';

/** `list_agents` row — never the system prompt, description capped at 80 chars. */
export interface AgentItem {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  description: string;
}

export function toAgentItem(a: AgentRecord): AgentItem {
  return {
    id: a.id,
    name: a.name,
    model: a.model,
    enabled: a.enabled,
    description: truncate(a.description, AGENT_DESCRIPTION_MAX),
  };
}
