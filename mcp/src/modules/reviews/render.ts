/** Model-facing line rendering for `get_findings`/`run_agent_on_pr` — presentation ring. */
import type { Verdict } from './ports.js';
import type { SummaryFindingItem } from './helpers.js';

export function renderFindingLine(f: SummaryFindingItem): string {
  const sev = f.severity.toUpperCase();
  const agentSuffix = f.agent ? ` (${f.agent})` : '';
  return `${sev} ${f.file}:${f.line} ${f.title}${agentSuffix}`;
}

/** `get_findings`'s "DONE" header line, above the per-finding lines. */
export function renderFindingsDoneHeader(pr: string, verdict: Verdict | null): string {
  return `DONE ${pr} verdict=${verdict ?? 'none'}`;
}

/** `run_agent_on_pr`'s "DONE" header line, above the per-finding lines. */
export function renderRunAgentOnPrDoneHeader(
  pr: string,
  agent: string,
  verdict: Verdict | null,
  score: number | null,
): string {
  return `DONE ${pr} (${agent}) verdict=${verdict ?? 'none'} score=${score ?? '-'}`;
}
