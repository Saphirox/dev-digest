/** Pure rules for Configure run. */
import type { Agent, PrMeta, ReviewRecord } from "@devdigest/shared";

const CLOSED_STATUSES: readonly string[] = ["closed", "merged"];

/** Pull requests that can be run (they need a DB id): open ones, newest number
 *  first, plus the currently selected one even when it is closed or merged. */
export function selectablePulls(pulls: readonly PrMeta[], selectedId: string): (PrMeta & { id: string })[] {
  return pulls
    .filter((p): p is PrMeta & { id: string } => !!p.id && (!CLOSED_STATUSES.includes(p.status) || p.id === selectedId))
    .sort((a, b) => b.number - a.number);
}

/** Summary line of an agent card: its newest stored review on the PR, else its description. */
export function agentSummary(agent: Agent, reviews: readonly ReviewRecord[] | undefined): string {
  // Reviews arrive newest first, so the first one of this agent is the latest.
  const latest = reviews?.find((r) => r.agent_id === agent.id);
  return latest?.summary?.trim() || agent.description;
}
