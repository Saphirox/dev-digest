import type { RunAllOutcome } from "@/lib/hooks/evals";

export type OutcomeStatus = RunAllOutcome["status"];

/** Latest "Run all agents" outcome per agent id. */
export function outcomesByAgent(outcomes: RunAllOutcome[] | undefined): Record<string, RunAllOutcome> {
  const out: Record<string, RunAllOutcome> = {};
  for (const o of outcomes ?? []) out[o.agentId] = o;
  return out;
}
