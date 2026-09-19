import type { Agent } from "@devdigest/shared";

/** Case-insensitive filter over an agent's name + description. */
export function filterAgents(agents: Agent[], search: string): Agent[] {
  const q = search.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q));
}

/**
 * The rail's order, decided once per page load: enabled agents first, each
 * group in the API's order (oldest first). Returned as ids so it can be frozen.
 */
export function railOrder(agents: Agent[]): string[] {
  return [...agents.filter((a) => a.enabled), ...agents.filter((a) => !a.enabled)].map((a) => a.id);
}

/**
 * Agents in a frozen order, so toggling doesn't move cards until the next page
 * load. Agents missing from it (created since) go first; deleted ones drop out.
 */
export function applyOrder(agents: Agent[], order: string[] | null): Agent[] {
  if (!order) return agents;
  const rank = new Map(order.map((id, i) => [id, i]));
  const fresh = agents.filter((a) => !rank.has(a.id));
  const known = agents.filter((a) => rank.has(a.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...fresh, ...known];
}
