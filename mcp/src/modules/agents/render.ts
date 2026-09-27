/** Model-facing line rendering for `list_agents` — presentation ring. */

export function renderAgentLine(a: { name: string; id: string; model: string; enabled: boolean }): string {
  return `${a.enabled ? 'ENABLED ' : 'DISABLED'} ${a.name} (${a.id}, ${a.model})`;
}
