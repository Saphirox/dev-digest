import {
  EvalExpectation,
  type EvalCase,
  type EvalCaseFromFindingInput,
  type EvalCaseFromFindingResult,
  type EvalCaseInput,
  type EvalCaseResult,
  type EvalCaseUpdate,
  type EvalDashboard,
  type EvalOverview,
  type EvalPeriod,
  type EvalRunAccepted,
  type EvalSuiteRun,
  type EvalSuiteRunDetail,
} from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { toSkillPromptBlock } from '../reviews/helpers.js';
import { OVERVIEW_RECENT_RUNS, OVERVIEW_TREND_POINTS, RUN_LIST_LIMIT } from './constants.js';
import {
  deltas,
  effectivePrompt,
  expectationFromDecision,
  headeredPatch,
  metricsOf,
  periodCutoff,
  pickPatchRow,
  regression,
  toCaseResult,
  toCurrent,
  toEvalCase,
  toOverviewRun,
  toSuiteRun,
  toSuiteRunDetail,
  toTrendPoint,
  validateExpectationAgainstDiff,
} from './helpers.js';
import type { EvalAgentConfig, EvalAgentSource, EvalCaseRecord, EvalLogger, EvalStore } from './ports.js';
import { failureReason, type EvalSuiteRunner } from './suite-runner.js';

export interface EvalsServiceDeps {
  store: EvalStore;
  agents: EvalAgentSource;
  runner: EvalSuiteRunner;
  logger: EvalLogger;
  now?: () => Date;
}

const conflict = (message: string, details?: unknown) => new AppError('conflict', message, 409, details);

/**
 * Eval cases, suite runs and the dashboards behind them. A case is made from a
 * finding or by hand; a suite run reviews every case of an agent with fixed
 * inputs in the background and is scored by pure code. Every lookup is scoped by
 * the caller's workspace.
 */
export class EvalsService {
  constructor(private deps: EvalsServiceDeps) {}

  // ---- cases ---------------------------------------------------------------

  /** `POST /findings/:id/eval-case` (AC-1..AC-4, EC-1..EC-4, EC-11, EC-15, EC-21..EC-23). */
  async createFromFinding(
    workspaceId: string,
    findingId: string,
    body: EvalCaseFromFindingInput,
  ): Promise<EvalCaseFromFindingResult> {
    const { store } = this.deps;
    const source = await store.findingForEval(workspaceId, findingId);
    if (!source) throw new NotFoundError('Finding not found');

    const { finding, review } = source;
    const existing = await store.caseForFinding(workspaceId, findingId);
    if (existing) return { case: await this.withLatest(await this.alignKind(existing, finding)), created: false };

    if (!review.agentId) {
      throw conflict('This finding has no producing agent (its review was not made by an agent), so it cannot become an eval case');
    }
    const agentWorkspace = await store.agentWorkspace(review.agentId);
    if (agentWorkspace === undefined) throw conflict('The agent that produced this finding no longer exists');
    if (agentWorkspace !== workspaceId) throw new NotFoundError('Agent not found');

    const expectation = expectationFromDecision(finding, body.kind);
    if (!expectation) {
      throw new ValidationError('kind is required for a finding that is neither accepted nor dismissed', {
        field: 'kind',
      });
    }

    // The finding's lines go through the same bounds as a hand-written expectation:
    // a stored out-of-range one would make every later `EvalExpectation.parse` throw
    // and the agent's case list 500. Rejected, never clamped.
    if (!EvalExpectation.safeParse(expectation).success) {
      throw conflict('finding line range is out of bounds for an eval case');
    }

    const pick = pickPatchRow(
      await store.prFilesForPath(workspaceId, review.prId, finding.file),
      finding.file,
      finding.startLine,
      finding.endLine,
    );
    if (pick.status === 'no_patch') throw conflict(`no diff available for ${finding.file}`);
    if (pick.status === 'stale') throw conflict('diff changed since the review');

    const inserted = await store.insertCase({
      workspaceId,
      ownerId: review.agentId,
      name: finding.title,
      inputDiff: headeredPatch(finding.file, pick.row.patch as string),
      inputMeta: { title: finding.title, severity: finding.severity, category: finding.category },
      expectedOutput: expectation,
      notes: null,
      sourceFindingId: finding.id,
    });
    if (inserted) return { case: toEvalCase(inserted, undefined), created: true };

    // Lost a race against a concurrent request for the same finding (EC-2).
    const raced = await store.caseForFinding(workspaceId, findingId);
    if (!raced) throw conflict('The eval case for this finding could not be created');
    return { case: await this.withLatest(await this.alignKind(raced, finding)), created: false };
  }

  /** `GET /agents/:id/eval-cases`: the eval set, each case with its latest result (AC-7). */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    await this.requireAgent(workspaceId, agentId);
    const records = await this.deps.store.listCases(workspaceId, agentId);
    const latest = new Map(
      (await this.deps.store.latestResults(workspaceId, records.map((r) => r.id))).map((r) => [r.caseId, r]),
    );
    return records.map((r) => toEvalCase(r, latest.get(r.id)));
  }

  /** `POST /agents/:id/eval-cases` (AC-26, EC-18). */
  async createCase(workspaceId: string, agentId: string, input: EvalCaseInput): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    const problem = validateExpectationAgainstDiff(input.input_diff, input.expected_output);
    if (problem) throw new ValidationError(problem);
    const inserted = await this.deps.store.insertCase({
      workspaceId,
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
      sourceFindingId: null,
    });
    if (!inserted) throw conflict('The eval case could not be created');
    return toEvalCase(inserted, undefined);
  }

  /** `PUT /eval-cases/:id`: name and expectation only; the diff never changes (AC-27). */
  async updateCase(workspaceId: string, id: string, patch: EvalCaseUpdate): Promise<EvalCase> {
    const existing = await this.requireCase(workspaceId, id);
    if (patch.expected_output) {
      // A must_find edit is re-checked against the stored diff, like a new case (EC-18).
      const problem = validateExpectationAgainstDiff(existing.inputDiff ?? '', patch.expected_output);
      if (problem) throw new ValidationError(problem);
    }
    const updated = await this.deps.store.updateCase(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return this.withLatest(updated);
  }

  /** `DELETE /eval-cases/:id`: earlier results keep their snapshot (AC-29, AC-31). */
  async deleteCase(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.store.deleteCase(workspaceId, id);
    if (!ok) throw new NotFoundError('Eval case not found');
  }

  // ---- runs ----------------------------------------------------------------

  /**
   * `POST /agents/:id/eval-runs`: record the run as `running`, review in the
   * background, answer at once (AC-9, AC-32). One running run per agent, enforced
   * by the database (EC-8). An empty eval set makes no model call (EC-5).
   */
  async startSuiteRun(workspaceId: string, agentId: string): Promise<EvalRunAccepted> {
    const { store, runner, logger } = this.deps;
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await store.listCases(workspaceId, agentId);
    if (cases.length === 0) throw conflict('This agent has no eval cases to run');

    // Build the full snapshot (every expectation parsed) BEFORE the `running`
    // row exists: a bad stored case must not leave the run stuck (EC-7).
    const snapshot = cases.map((c) => ({
      id: c.id,
      name: c.name,
      inputDiff: c.inputDiff ?? '',
      expected: EvalExpectation.parse(c.expectedOutput),
    }));
    const skillBlocks = await this.skillBlocks(agent.id);
    const run = await store.insertSuiteRun({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      casesTotal: cases.length,
      effectivePrompt: effectivePrompt(agent.systemPrompt, skillBlocks),
      model: agent.model,
      provider: agent.provider,
    });
    if (!run) throw conflict('An eval run for this agent is already in progress');

    // Fire and forget. `execute` records its own failures; the catch only guards
    // against an unexpected throw becoming an unhandled rejection.
    void runner
      .execute({
        runId: run.id,
        workspaceId,
        agent,
        skillBlocks,
        cases: snapshot,
      })
      .catch((err) => logger.error({ agentId, reason: failureReason(err) }, 'eval: suite runner crashed'));
    return { run_id: run.id, status: 'running' };
  }

  /**
   * `POST /eval-cases/:id/run`: review ONE case now and store the result without
   * a suite run (AC-34). Synchronous. Refused while a suite run of the agent is
   * in progress (EC-8; a check-then-run, not serialised against a suite start).
   */
  async runCase(workspaceId: string, caseId: string): Promise<EvalCaseResult> {
    const { store, runner } = this.deps;
    const c = await this.requireCase(workspaceId, caseId);
    const agent = await this.requireAgent(workspaceId, c.ownerId);
    if (await store.runningSuiteRun(workspaceId, agent.id)) throw conflict('An eval run for this agent is already in progress');

    const expected = EvalExpectation.parse(c.expectedOutput);
    let reviewed;
    try {
      reviewed = await runner.reviewCase(agent, await this.skillBlocks(agent.id), {
        id: c.id,
        name: c.name,
        inputDiff: c.inputDiff ?? '',
        expected,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Eval review failed: ${failureReason(err)}`);
    }
    const stored = await store.insertCaseResult({
      caseId: c.id,
      suiteRunId: null,
      workspaceId,
      agentId: agent.id,
      caseName: c.name,
      expected,
      ranAt: reviewed.ranAt,
      findings: reviewed.output.findings,
      pass: reviewed.score.pass,
      durationMs: reviewed.durationMs,
      costUsd: reviewed.output.costUsd,
      keptCount: reviewed.output.keptCount,
      droppedCount: reviewed.output.droppedCount,
      expectedCount: reviewed.score.expectedCount,
      producedCount: reviewed.score.producedCount,
    });
    return toCaseResult(stored);
  }

  // ---- reads ---------------------------------------------------------------

  /** `GET /agents/:id/eval-runs?period=`: newest first (AC-19, AC-33, AC-39). */
  async listRuns(workspaceId: string, agentId: string, period: EvalPeriod): Promise<EvalSuiteRun[]> {
    await this.requireAgent(workspaceId, agentId);
    return (await this.periodRuns(workspaceId, agentId, period)).map(toSuiteRun);
  }

  /** `GET /eval-runs/:id`: a run with its effective prompt and case results (AC-21). */
  async getRun(workspaceId: string, id: string): Promise<EvalSuiteRunDetail> {
    const run = await this.deps.store.getSuiteRun(workspaceId, id);
    if (!run) throw new NotFoundError('Eval run not found');
    return toSuiteRunDetail(run, await this.deps.store.caseResultsForRun(workspaceId, run.id));
  }

  /**
   * `GET /agents/:id/eval-dashboard?period=` (AC-18, AC-36, AC-37). The tiles and
   * the regression compare the two newest `done` runs whatever the period; the
   * trend and the run list honour the period.
   */
  async dashboard(workspaceId: string, agentId: string, period: EvalPeriod): Promise<EvalDashboard> {
    const { store } = this.deps;
    await this.requireAgent(workspaceId, agentId);
    const [casesTotal, latestDone, runs] = await Promise.all([
      store.countCases(workspaceId, agentId),
      store.recentDoneRuns(workspaceId, agentId, 2),
      this.periodRuns(workspaceId, agentId, period),
    ]);
    const [current, previous] = latestDone;
    return {
      agent_id: agentId,
      cases_total: casesTotal,
      current: current ? toCurrent(current) : null,
      delta: current && previous ? deltas(metricsOf(current), metricsOf(previous)) : null,
      trend: runs
        .filter((r) => r.status === 'done')
        .reverse()
        .map(toTrendPoint),
      recent_runs: runs.map(toSuiteRun),
      regression:
        current && previous
          ? regression({ version: current.agentVersion, ...metricsOf(current) }, metricsOf(previous))
          : null,
    };
  }

  /** `GET /eval/overview`: one row per existing agent with cases, plus recent runs (AC-23, AC-24, EC-26). */
  async overview(workspaceId: string): Promise<EvalOverview> {
    const { store } = this.deps;
    const agents = await store.agentsWithCases(workspaceId);
    const rows = await Promise.all(
      agents.map(async (a) => {
        const [latest, done] = await Promise.all([
          store.latestRun(workspaceId, a.agentId),
          store.recentDoneRuns(workspaceId, a.agentId, OVERVIEW_TREND_POINTS),
        ]);
        return {
          agent_id: a.agentId,
          agent_name: a.agentName,
          model: a.model,
          provider: a.provider,
          cases_total: a.casesTotal,
          latest_run: latest ? toSuiteRun(latest) : null,
          trend: [...done].reverse().map(toTrendPoint),
        };
      }),
    );
    const recent = await store.recentRuns(workspaceId, OVERVIEW_RECENT_RUNS);
    return { agents: rows, recent_runs: recent.map(toOverviewRun) };
  }

  // ---- internals -----------------------------------------------------------

  private async periodRuns(workspaceId: string, agentId: string, period: EvalPeriod) {
    const now = (this.deps.now ?? (() => new Date()))();
    const runs = await this.deps.store.listSuiteRuns(workspaceId, agentId, periodCutoff(period, now));
    return runs.slice(0, RUN_LIST_LIMIT);
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<EvalAgentConfig> {
    const agent = await this.deps.agents.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async requireCase(workspaceId: string, id: string): Promise<EvalCaseRecord> {
    const record = await this.deps.store.getCase(workspaceId, id);
    if (!record) throw new NotFoundError('Eval case not found');
    return record;
  }

  /**
   * The case of a decided finding always carries the kind its CURRENT decision
   * implies (EC-11, revised 2026-10-08): accepted is `must_find`, dismissed is
   * `must_not_flag`. A differing kind is flipped in place, file and lines kept;
   * an undecided finding, or a matching kind, returns the case as it is.
   */
  private async alignKind(
    existing: EvalCaseRecord,
    finding: Parameters<typeof expectationFromDecision>[0],
  ): Promise<EvalCaseRecord> {
    const decided = expectationFromDecision(finding, undefined);
    if (!decided) return existing;
    const current = (existing.expectedOutput as { kind?: unknown } | null)?.kind;
    if (current === decided.kind) return existing;
    const updated = await this.deps.store.setCaseKind(existing.workspaceId, existing.id, decided.kind);
    // Deleted between the lookup and the update: the case is gone.
    if (!updated) throw new NotFoundError('Eval case not found');
    return updated;
  }

  private async withLatest(record: EvalCaseRecord): Promise<EvalCase> {
    const [latest] = await this.deps.store.latestResults(record.workspaceId, [record.id]);
    return toEvalCase(record, latest);
  }

  private async skillBlocks(agentId: string): Promise<string[]> {
    return (await this.deps.agents.enabledSkills(agentId)).map(toSkillPromptBlock);
  }
}
