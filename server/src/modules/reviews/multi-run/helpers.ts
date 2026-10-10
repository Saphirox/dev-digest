/**
 * Pure grouping of one multi-agent run's findings (no I/O, no `this`).
 * Same file + overlapping or near line ranges → one group, transitively.
 * No text similarity: the title/category of a finding never affects grouping.
 */
import type { FindingGroup } from '@devdigest/shared';
import { GROUP_LINE_GAP } from './constants.js';

export interface GroupableFinding {
  id: string;
  agent_id: string;
  run_id: string;
  file: string;
  start_line: number;
  end_line: number | null;
  severity: string;
}

export interface GroupableRun {
  run_id: string;
  agent_id: string | null;
  status: string | null;
}

interface Placed extends GroupableFinding {
  end: number;
  order: number;
}

const cmp = <T extends string | number>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Group findings across agents. Output is a pure function of the SET of inputs:
 * findings are sorted (file, start, end, run order, id) before grouping, so
 * input order never changes the result (NFR-2). `runs` is the agent list order.
 *
 * `conflict` = a participating run that is `done` has no member in the group,
 * or the members carry different severities. Running / failed / cancelled runs
 * never make a group a conflict.
 */
export function groupFindings(findings: GroupableFinding[], runs: GroupableRun[]): FindingGroup[] {
  const runOrder = new Map(runs.map((r, i) => [r.run_id, i]));
  const doneRunIds = runs.filter((r) => r.status === 'done').map((r) => r.run_id);

  const placed: Placed[] = findings
    .map((f) => ({
      ...f,
      end: f.end_line ?? f.start_line,
      order: runOrder.get(f.run_id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (a, b) =>
        cmp(a.file, b.file) ||
        cmp(a.start_line, b.start_line) ||
        cmp(a.end, b.end) ||
        cmp(a.order, b.order) ||
        cmp(a.id, b.id),
    );

  const buckets: Placed[][] = [];
  let current: Placed[] = [];
  let currentEnd = 0;
  for (const f of placed) {
    const joins =
      current.length > 0 &&
      current[0]!.file === f.file &&
      f.start_line - currentEnd <= GROUP_LINE_GAP;
    if (joins) {
      current.push(f);
      currentEnd = Math.max(currentEnd, f.end);
    } else {
      current = [f];
      currentEnd = f.end;
      buckets.push(current);
    }
  }

  return buckets.map((members) => {
    const runIdsInGroup = new Set(members.map((m) => m.run_id));
    const severities = new Set(members.map((m) => m.severity));
    const missingDone = doneRunIds.some((id) => !runIdsInGroup.has(id));
    return {
      file: members[0]!.file,
      start_line: members[0]!.start_line,
      end_line: Math.max(...members.map((m) => m.end)),
      conflict: missingDone || severities.size > 1,
      members: members.map((m) => ({ finding_id: m.id, agent_id: m.agent_id, run_id: m.run_id })),
    };
  });
}
