import { describe, it, expect } from 'vitest';
import {
  groupFindings,
  type GroupableFinding,
  type GroupableRun,
} from '../src/modules/reviews/multi-run/helpers.js';

const SEC = 'agent-sec';
const PERF = 'agent-perf';
const CUST = 'agent-cust';

const runs = (status: Record<string, string> = {}): GroupableRun[] =>
  [SEC, PERF, CUST].map((a) => ({ run_id: `run-${a}`, agent_id: a, status: status[a] ?? 'done' }));

let n = 0;
const f = (
  agent: string,
  file: string,
  start: number,
  end: number | null = null,
  severity = 'WARNING',
  id?: string,
): GroupableFinding => ({
  id: id ?? `f${++n}`,
  agent_id: agent,
  run_id: `run-${agent}`,
  file,
  start_line: start,
  end_line: end,
  severity,
});

const RL = 'src/middleware/ratelimit.ts';

describe('groupFindings', () => {
  it('AC-8: 3 members at ratelimit.ts:52 form one group (1 Security, 2 Customer-Facing)', () => {
    const groups = groupFindings(
      [f(SEC, RL, 52), f(CUST, RL, 52), f(CUST, RL, 52)],
      runs({ [PERF]: 'running' }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toHaveLength(3);
    expect(groups[0]!.members.filter((m) => m.agent_id === SEC)).toHaveLength(1);
    expect(groups[0]!.members.filter((m) => m.agent_id === CUST)).toHaveLength(2);
  });

  it('AC-8: gap 3 joins (10-12 and 15)', () => {
    const groups = groupFindings([f(SEC, RL, 10, 12), f(CUST, RL, 15)], runs());
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ start_line: 10, end_line: 15 });
  });

  it('AC-8: gap 4 splits (10-12 and 16)', () => {
    const groups = groupFindings([f(SEC, RL, 10, 12), f(CUST, RL, 16)], runs());
    expect(groups).toHaveLength(2);
  });

  it('AC-8: transitive 10<->13<->16 forms one group of 3', () => {
    const file = 'src/api/users.ts';
    const groups = groupFindings([f(SEC, file, 10), f(PERF, file, 13), f(CUST, file, 16)], runs());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toHaveLength(3);
    expect(groups[0]).toMatchObject({ start_line: 10, end_line: 16 });
  });

  it('AC-8: 27/28 form one group despite different topics', () => {
    const groups = groupFindings(
      [f(PERF, RL, 27, null, 'WARNING'), f('agent-junior', RL, 28, null, 'WARNING')],
      [...runs(), { run_id: 'run-agent-junior', agent_id: 'agent-junior', status: 'done' }],
    );
    expect(groups).toHaveLength(1);
  });

  it('AC-8: paths are compared exactly (config.ts vs Config.ts)', () => {
    const groups = groupFindings([f(SEC, 'src/config.ts', 12), f(PERF, 'src/Config.ts', 12)], runs());
    expect(groups).toHaveLength(2);
  });

  it('EC-8: null end line counts as the start line, gap 2 joins 12 and 14-20', () => {
    const groups = groupFindings([f(SEC, 'src/config.ts', 12, null), f(PERF, 'src/config.ts', 14, 20)], runs());
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ start_line: 12, end_line: 20 });
  });

  it('AC-9: every finding appears once, with its finding, agent and run ids intact', () => {
    const input = [f(SEC, RL, 52, null, 'WARNING', 'a'), f(CUST, RL, 52, null, 'WARNING', 'b'), f(CUST, RL, 90, null, 'INFO', 'c')];
    const groups = groupFindings(input, runs());
    const members = groups.flatMap((g) => g.members);
    expect(members).toHaveLength(input.length);
    for (const i of input) {
      expect(members).toContainEqual({ finding_id: i.id, agent_id: i.agent_id, run_id: i.run_id });
    }
  });

  it('AC-10: a done agent that did not flag makes the group a conflict', () => {
    const groups = groupFindings([f(SEC, RL, 52), f(CUST, RL, 52), f(CUST, RL, 52)], runs());
    expect(groups[0]!.conflict).toBe(true); // Performance is done and absent
  });

  it('AC-10: different severities make a conflict', () => {
    const file = 'src/config.ts';
    const groups = groupFindings(
      [f(SEC, file, 12, null, 'CRITICAL'), f(PERF, file, 12, null, 'WARNING'), f(CUST, file, 12, null, 'CRITICAL')],
      runs(),
    );
    expect(groups[0]!.conflict).toBe(true);
  });

  it('AC-10: same severity and every agent flagged is not a conflict', () => {
    const file = 'src/config.ts';
    const groups = groupFindings(
      [f(SEC, file, 12, null, 'CRITICAL'), f(PERF, file, 12, null, 'CRITICAL'), f(CUST, file, 12, null, 'CRITICAL')],
      runs(),
    );
    expect(groups[0]!.conflict).toBe(false);
  });

  it('AC-10: a running or failed agent never makes a group a conflict (D-19)', () => {
    const file = 'src/config.ts';
    const groups = groupFindings(
      [f(SEC, file, 12, null, 'CRITICAL')],
      runs({ [PERF]: 'failed', [CUST]: 'running' }),
    );
    expect(groups[0]!.conflict).toBe(false);
  });

  it('NFR-2: shuffled input gives an identical result', () => {
    const input = [
      f(SEC, RL, 10, 12, 'WARNING', 'a'),
      f(PERF, RL, 15, null, 'INFO', 'b'),
      f(CUST, RL, 15, null, 'INFO', 'c'),
      f(SEC, 'src/a.ts', 3, null, 'INFO', 'd'),
      f(CUST, 'src/a.ts', 3, null, 'INFO', 'e'),
      f(PERF, RL, 100, 101, 'CRITICAL', 'g'),
    ];
    const expected = groupFindings(input, runs());
    const shuffles = [[...input].reverse(), [input[3]!, input[0]!, input[5]!, input[2]!, input[4]!, input[1]!]];
    for (const s of shuffles) expect(groupFindings(s, runs())).toEqual(expected);
  });

  it('returns no groups for no findings', () => {
    expect(groupFindings([], runs())).toEqual([]);
  });
});
