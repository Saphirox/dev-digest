/** Which agents are checked when a run is configured — shared by Configure run
 *  and the PR page picker. Pure, no React. */
import type { Agent } from "@devdigest/shared";

/** Every enabled agent starts checked, every disabled one unchecked. */
export function defaultSelection(agents: readonly Agent[]): string[] {
  return agents.filter((a) => a.enabled).map((a) => a.id);
}

/** The checked ids in agent list order — the order sent to the API. */
export function inAgentOrder(agents: readonly Agent[], ids: readonly string[]): string[] {
  const chosen = new Set(ids);
  return agents.filter((a) => chosen.has(a.id)).map((a) => a.id);
}
