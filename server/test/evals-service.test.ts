import { describe, it, expect } from 'vitest';
import type { EvalExpectation, Finding, Review } from '@devdigest/shared';
import { INJECTION_GUARD } from '@devdigest/reviewer-core';
import { EvalsService } from '../src/modules/evals/service.js';
import { EvalSuiteRunner } from '../src/modules/evals/suite-runner.js';
import { createEvalEngine } from '../src/modules/evals/engine.js';
import { EVAL_TASK_LINE } from '../src/modules/evals/constants.js';
import { headeredPatch, scoreSuite } from '../src/modules/evals/helpers.js';
import type {
  EvalAgentConfig,
  EvalAgentSource,
  EvalCaseRecord,
  EvalCaseResultRecord,
  EvalEngine,
  EvalEngineInput,
  EvalFindingSource,
  EvalLogger,
  EvalStore,
  EvalSuiteRunDetailRecord,
  NewCaseResult,
  NewEvalCase,
  NewSuiteRun,
} from '../src/modules/evals/ports.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

const WS = 'ws-1';
const AGENT_ID = '11111111-1111-1111-1111-111111111111';

const DIFF_A = headeredPatch('src/config.ts', '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,');
const DIFF_B = headeredPatch('src/api/users.ts', '@@ -40,3 +40,4 @@\n a\n+b\n c');

const finding = (file: string, start: number, end = start): Finding => ({
  id: `${file}:${start}`,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
  file,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
});

/** In-memory EvalStore: just enough behaviour for the service and the runner. */
class FakeStore implements EvalStore {
  cases: EvalCaseRecord[] = [];
  runs: (EvalSuiteRunDetailRecord & { results: NewCaseResult[] })[] = [];
  singles: NewCaseResult[] = [];
  kindWrites = 0;
  private settle!: () => void;
  settled = new Promise<void>((r) => (this.settle = r));
  resetSettled() {
    this.settled = new Promise<void>((r) => (this.settle = r));
  }

  addCase(name: string, diff: string, expected: EvalExpectation): EvalCaseRecord {
    const rec: EvalCaseRecord = {
      id: `case-${this.cases.length + 1}`,
      workspaceId: WS,
      ownerKind: 'agent',
      ownerId: AGENT_ID,
      name,
      inputDiff: diff,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: expected,
      notes: null,
      createdAt: new Date(2026, 0, this.cases.length + 1),
      sourceFindingId: null,
    };
    this.cases.push(rec);
    return rec;
  }

  /** Set by a test to make `createFromFinding` find a finding. */
  source: EvalFindingSource | undefined;
  async findingForEval() {
    return this.source;
  }
  async agentWorkspace() {
    return WS;
  }
  async prFilesForPath() {
    return [];
  }
  async insertCase(v: NewEvalCase) {
    return this.addCase(v.name, v.inputDiff, v.expectedOutput);
  }
  async getCase(_ws: string, id: string) {
    return this.cases.find((c) => c.id === id);
  }
  async caseForFinding(_ws: string, findingId: string) {
    return this.cases.find((c) => c.sourceFindingId === findingId);
  }
  async listCases() {
    return [...this.cases];
  }
  async countCases() {
    return this.cases.length;
  }
  async updateCase() {
    return undefined;
  }
  async setCaseKind(_ws: string, id: string, kind: EvalExpectation['kind']) {
    const c = this.cases.find((x) => x.id === id);
    if (!c) return undefined;
    c.expectedOutput = { ...(c.expectedOutput as EvalExpectation), kind };
    this.kindWrites += 1;
    return c;
  }
  async deleteCase(_ws: string, id: string) {
    const n = this.cases.length;
    this.cases = this.cases.filter((c) => c.id !== id);
    return this.cases.length < n;
  }
  async latestResults() {
    return [] as EvalCaseResultRecord[];
  }
  async insertSuiteRun(v: NewSuiteRun) {
    if (this.runs.some((r) => r.agentId === v.agentId && r.status === 'running')) return null;
    const run = {
      id: `run-${this.runs.length + 1}`,
      agentId: v.agentId,
      agentVersion: v.agentVersion,
      status: 'running' as const,
      startedAt: new Date(),
      finishedAt: null,
      recall: null,
      precision: null,
      citationAccuracy: null,
      casesPassed: null,
      casesTotal: v.casesTotal,
      costUsd: null,
      error: null,
      failingCaseName: null,
      model: v.model,
      provider: v.provider,
      effectivePrompt: v.effectivePrompt,
      results: [] as NewCaseResult[],
    };
    this.runs.push(run);
    return run;
  }
  async runningSuiteRun(_ws: string, agentId: string) {
    return this.runs.find((r) => r.agentId === agentId && r.status === 'running');
  }
  async finishSuiteRun(_ws: string, id: string, m: { recall: number | null; precision: number | null; citationAccuracy: number | null; casesPassed: number; costUsd: number | null }, results: NewCaseResult[]) {
    const run = this.runs.find((r) => r.id === id)!;
    Object.assign(run, { status: 'done', ...m, results });
    this.settle();
  }
  async failSuiteRun(_ws: string, id: string, f: { error: string; failingCaseName: string | null }) {
    Object.assign(this.runs.find((r) => r.id === id)!, { status: 'failed', error: f.error, failingCaseName: f.failingCaseName });
    this.settle();
  }
  async insertCaseResult(r: NewCaseResult) {
    this.singles.push(r);
    return {
      id: 'single',
      caseId: r.caseId,
      suiteRunId: null,
      caseName: r.caseName,
      expected: r.expected,
      ranAt: r.ranAt,
      actualOutput: r.findings,
      pass: r.pass,
      durationMs: r.durationMs,
      costUsd: r.costUsd,
      keptCount: r.keptCount,
      droppedCount: r.droppedCount,
      expectedCount: r.expectedCount,
      producedCount: r.producedCount,
    };
  }
  async listSuiteRuns() {
    return [];
  }
  async recentDoneRuns() {
    return [];
  }
  async getSuiteRun() {
    return undefined;
  }
  async caseResultsForRun() {
    return [];
  }
  async reapRunning() {
    return 0;
  }
  async agentsWithCases() {
    return [];
  }
  async latestRun() {
    return undefined;
  }
  async recentRuns() {
    return [];
  }
}

const agent = (over: Partial<EvalAgentConfig> = {}): EvalAgentConfig => ({
  id: AGENT_ID,
  name: 'Sec',
  version: 3,
  provider: 'openai',
  model: 'gpt-4.1',
  strategy: 'single-pass',
  systemPrompt: 'You are a security reviewer.',
  ...over,
});

// `getAgent` reads the live config so a test can edit the agent mid-run (EC-10).
const agentSourceHolder = { cfg: agent() };

function agentSource(skills: { name: string; body: string }[] = []): EvalAgentSource {
  return {
    getAgent: async () => agentSourceHolder.cfg,
    enabledSkills: async () => skills,
  };
}

const quietLogger = (): EvalLogger & { infos: unknown[][]; warns: unknown[][] } => {
  const l = {
    infos: [] as unknown[][],
    warns: [] as unknown[][],
    info: (...a: unknown[]) => void l.infos.push(a),
    warn: (...a: unknown[]) => void l.warns.push(a),
    error: () => undefined,
  };
  return l;
};

function build(engine: EvalEngine, opts: { skills?: { name: string; body: string }[] } = {}) {
  const store = new FakeStore();
  agentSourceHolder.cfg = agent();
  const agents = agentSource(opts.skills);
  const logger = quietLogger();
  const runner = new EvalSuiteRunner({ store, engine, logger });
  const service = new EvalsService({ store, agents, runner, logger });
  return { store, service, logger };
}

/** An engine that records each input and answers per case index. */
function recordingEngine(answer: (n: number) => Finding[] | Error): EvalEngine & { inputs: EvalEngineInput[] } {
  const inputs: EvalEngineInput[] = [];
  return {
    inputs,
    async review(input) {
      inputs.push(input);
      const out = answer(inputs.length);
      if (out instanceof Error) throw out;
      return { findings: out, keptCount: out.length, droppedCount: 0, costUsd: 0.01 };
    },
  };
}

const mustFind = (file: string, s: number): EvalExpectation => ({ kind: 'must_find', file, start_line: s, end_line: s });
const mustNot = (file: string, s: number, e = s): EvalExpectation => ({ kind: 'must_not_flag', file, start_line: s, end_line: e });

describe('suite run', () => {
  it('AC-9/AC-32: answers 202-shaped at once, reviews each case once, stores the results', async () => {
    const engine = recordingEngine(() => [finding('src/config.ts', 11)]);
    const { store, service } = build(engine);
    store.addCase('A', DIFF_A, mustFind('src/config.ts', 11));
    store.addCase('B', DIFF_B, mustNot('src/api/users.ts', 41));
    const accepted = await service.startSuiteRun(WS, AGENT_ID);
    expect(accepted).toEqual({ run_id: 'run-1', status: 'running' });
    expect(store.runs[0]!.status).toBe('running');
    await store.settled;
    expect(store.runs[0]!.status).toBe('done');
    expect(engine.inputs).toHaveLength(2);
    expect(store.runs[0]!.results.map((r) => r.caseName)).toEqual(['A', 'B']);
  });

  it('AC-10/EC-10: two runs send identical engine inputs; an edit mid-run changes nothing', async () => {
    const engine = recordingEngine(() => []);
    const { store, service } = build(engine, { skills: [{ name: 'S', body: ' body ' }] });
    store.addCase('A', DIFF_A, mustNot('src/config.ts', 11));
    await service.startSuiteRun(WS, AGENT_ID);
    await store.settled;
    store.resetSettled();
    await service.startSuiteRun(WS, AGENT_ID);
    await store.settled;
    expect(engine.inputs).toHaveLength(2);
    expect(engine.inputs[0]).toEqual(engine.inputs[1]);
    expect(engine.inputs[0]!.task).toBe(EVAL_TASK_LINE);
    expect(engine.inputs[0]!.skills).toEqual(['### S\nbody']);
    // The engine input carries nothing but the AC-10 fields.
    expect(Object.keys(engine.inputs[0]!).sort()).toEqual(
      ['diff', 'model', 'provider', 'skills', 'strategy', 'systemPrompt', 'task'].sort(),
    );
    expect(store.runs[0]!.effectivePrompt).toBe('You are a security reviewer.\n\n### S\nbody');
    expect(store.runs[0]!.agentVersion).toBe(3);
  });

  it('EC-10/EC-27: a run uses the agent and cases as they were at start', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inputs: EvalEngineInput[] = [];
    const engine: EvalEngine = {
      async review(input) {
        inputs.push(input);
        await gate;
        return { findings: [], keptCount: 0, droppedCount: 0, costUsd: 0 };
      },
    };
    const { store, service } = build(engine);
    store.addCase('A', DIFF_A, mustNot('src/config.ts', 11));
    store.addCase('B', DIFF_B, mustNot('src/api/users.ts', 41));
    await service.startSuiteRun(WS, AGENT_ID);
    // Edit the agent and delete a case while the first review is in flight.
    agentSourceHolder.cfg = agent({ systemPrompt: 'CHANGED', version: 4 });
    await store.deleteCase(WS, 'case-2');
    release();
    await store.settled;
    expect(inputs.map((i) => i.systemPrompt)).toEqual(['You are a security reviewer.', 'You are a security reviewer.']);
    expect(inputs[1]!.diff).toBe(DIFF_B);
    expect(store.runs[0]!.agentVersion).toBe(3);
    expect(store.runs[0]!.results.map((r) => r.caseName)).toEqual(['A', 'B']);
  });

  it('EC-5: an empty eval set is a 409 with no model call', async () => {
    const engine = recordingEngine(() => []);
    const { service } = build(engine);
    await expect(service.startSuiteRun(WS, AGENT_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(engine.inputs).toHaveLength(0);
  });

  it('EC-8: a second start while one is running is a 409; runCase is refused too', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const engine: EvalEngine = {
      async review() {
        await gate;
        return { findings: [], keptCount: 0, droppedCount: 0, costUsd: 0 };
      },
    };
    const { store, service } = build(engine);
    store.addCase('A', DIFF_A, mustNot('src/config.ts', 11));
    await service.startSuiteRun(WS, AGENT_ID);
    await expect(service.startSuiteRun(WS, AGENT_ID)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.runCase(WS, 'case-1')).rejects.toMatchObject({ statusCode: 409 });
    release();
    await store.settled;
  });

  it('EC-7/NFR-8/NFR-3: a model failure on case 2 fails the run, stops, and is logged', async () => {
    const engine = recordingEngine((n) => (n === 2 ? new Error('provider exploded') : []));
    const { store, service, logger } = build(engine);
    store.addCase('A', DIFF_A, mustNot('src/config.ts', 11));
    store.addCase('B', DIFF_B, mustNot('src/api/users.ts', 41));
    store.addCase('C', DIFF_B, mustNot('src/api/users.ts', 42));
    await service.startSuiteRun(WS, AGENT_ID);
    await store.settled;
    const run = store.runs[0]!;
    expect(run).toMatchObject({ status: 'failed', error: 'provider exploded', failingCaseName: 'B', recall: null, precision: null });
    expect(engine.inputs).toHaveLength(2); // case 3 never reviewed, nothing retried
    const [obj, msg] = logger.warns[0]!;
    expect(msg).toBe('eval: suite run failed');
    expect(obj).toMatchObject({ agentId: AGENT_ID, version: 3, cases: 3, failingCase: 'B', reason: 'provider exploded' });
    expect(JSON.stringify(logger.warns)).not.toContain('sk_live_xxx');
  });

  it('EC-7: a stored case with an unparseable expectation is rejected before any run row exists', async () => {
    const engine = recordingEngine(() => []);
    const { store, service } = build(engine);
    store.addCase('A', DIFF_A, mustNot('src/config.ts', 11));
    store.addCase('B', DIFF_B, { kind: 'bogus' } as unknown as EvalExpectation);
    await expect(service.startSuiteRun(WS, AGENT_ID)).rejects.toThrow();
    // No `running` row is left behind to block every later start (EC-8).
    expect(store.runs).toHaveLength(0);
    expect(engine.inputs).toHaveLength(0);
  });

  it('NFR-3: a finished run logs agent, version, case count, passed and duration', async () => {
    const { store, service, logger } = build(recordingEngine(() => []));
    store.addCase('A', DIFF_A, mustNot('src/config.ts', 11));
    await service.startSuiteRun(WS, AGENT_ID);
    await store.settled;
    await new Promise((r) => setTimeout(r, 0)); // the runner logs right after finishSuiteRun resolves
    const [obj, msg] = logger.infos[0]!;
    expect(msg).toBe('eval: suite run done');
    expect(obj).toMatchObject({ agentId: AGENT_ID, version: 3, cases: 1, passed: 1 });
    expect(typeof (obj as { durationMs: number }).durationMs).toBe('number');
  });

  it('AC-34: runCase stores a result with no suite run', async () => {
    const { store, service } = build(recordingEngine(() => [finding('src/config.ts', 11)]));
    store.addCase('A', DIFF_A, mustFind('src/config.ts', 11));
    const result = await service.runCase(WS, 'case-1');
    expect(result).toMatchObject({ pass: true, suite_run_id: null, case_name: 'A', expected_count: 1, produced_count: 1 });
    expect(store.runs).toHaveLength(0);
    expect(store.singles).toHaveLength(1);
  });
});

describe('NFR-1 / NFR-2: the model is reached only for case reviews, behind the shared wrapper', () => {
  const REVIEW: Review = { verdict: 'comment', summary: 's', score: 80, findings: [finding('src/config.ts', 11), finding('src/config.ts', 999)] };

  it('NFR-1: N cases make exactly N completeStructured calls; re-scoring makes none', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const { store, service } = build(createEvalEngine(async () => llm));
    store.addCase('A', DIFF_A, mustFind('src/config.ts', 11));
    store.addCase('B', DIFF_A, mustNot('src/config.ts', 11));
    store.addCase('C', DIFF_A, mustNot('src/other.ts', 1));
    await service.startSuiteRun(WS, AGENT_ID);
    await store.settled;
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(3);
    const before = llm.calls.length;
    const run = store.runs[0]!;
    scoreSuite(run.results.map((r) => ({ expectation: r.expected, findings: r.findings, keptCount: r.keptCount, droppedCount: r.droppedCount, costUsd: r.costUsd })));
    expect(llm.calls.length).toBe(before);
    // Grounding kept line 11, dropped line 999 (citation 1/2 per case).
    expect(run.citationAccuracy).toBe(0.5);
  });

  it('NFR-2/AC-10: the diff is wrapped as untrusted, the guard is present, no repo-intel or context sections', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const { store, service } = build(createEvalEngine(async () => llm), { skills: [{ name: 'S', body: 'rule' }] });
    store.addCase('A', DIFF_A, mustFind('src/config.ts', 11));
    await service.startSuiteRun(WS, AGENT_ID);
    await store.settled;
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as { messages: { role: string; content: string }[] };
    const text = req.messages.map((m) => m.content).join('\n');
    expect(text).toContain(INJECTION_GUARD);
    expect(text).toContain('stripeKey');
    expect(text).toContain(EVAL_TASK_LINE);
    expect(text).toContain('### S');
    // The untrusted diff sits inside a delimiter block, not loose in the prompt.
    const open = text.indexOf('<untrusted source="diff">');
    expect(open).toBeGreaterThan(-1);
    expect(text.indexOf('stripeKey')).toBeGreaterThan(open);
    expect(text.indexOf('</untrusted>', open)).toBeGreaterThan(text.indexOf('stripeKey'));
    for (const heading of ['## Repo skeleton', '## Callers', '## Project context', '## Derived intent', '## PR description']) {
      expect(text).not.toContain(heading);
    }
  });
});

describe('EC-11 (revised): createFromFinding aligns an existing case with the current decision', () => {
  const FINDING_ID = 'f-1';
  const source = (decision: 'accepted' | 'dismissed' | null): EvalFindingSource => ({
    finding: {
      id: FINDING_ID,
      file: 'src/config.ts',
      startLine: 11,
      endLine: 12,
      title: 't',
      severity: 'CRITICAL',
      category: 'security',
      acceptedAt: decision === 'accepted' ? new Date() : null,
      dismissedAt: decision === 'dismissed' ? new Date() : null,
    },
    review: { id: 'r-1', agentId: AGENT_ID, prId: 'pr-1' },
  });
  const world = (stored: EvalExpectation, decision: 'accepted' | 'dismissed' | null) => {
    const { store, service } = build(recordingEngine(() => []));
    store.addCase('c', DIFF_A, stored).sourceFindingId = FINDING_ID;
    store.source = source(decision);
    return { store, service };
  };

  it('a rejected finding flips a stored must_find to must_not_flag, lines kept, created:false', async () => {
    const { store, service } = world(mustFind('src/config.ts', 11), 'dismissed');
    const res = await service.createFromFinding(WS, FINDING_ID, {});
    expect(res.created).toBe(false);
    expect(res.case.expected_output).toEqual({ kind: 'must_not_flag', file: 'src/config.ts', start_line: 11, end_line: 11 });
    expect(store.kindWrites).toBe(1);
  });

  it('an accepted finding flips a stored must_not_flag to must_find', async () => {
    const { service } = world(mustNot('src/config.ts', 11, 12), 'accepted');
    const res = await service.createFromFinding(WS, FINDING_ID, {});
    expect(res.case.expected_output.kind).toBe('must_find');
  });

  it('a matching kind or an undecided finding writes nothing', async () => {
    const same = world(mustFind('src/config.ts', 11), 'accepted');
    expect((await same.service.createFromFinding(WS, FINDING_ID, {})).case.expected_output.kind).toBe('must_find');
    expect(same.store.kindWrites).toBe(0);
    const undecided = world(mustFind('src/config.ts', 11), null);
    expect((await undecided.service.createFromFinding(WS, FINDING_ID, { kind: 'must_not_flag' })).case.expected_output.kind).toBe('must_find');
    expect(undecided.store.kindWrites).toBe(0);
  });
});
