import { MAX_ERROR_CHARS, EVAL_TASK_LINE } from './constants.js';
import { scoreCase, scoreSuite, type CaseScore } from './helpers.js';
import type {
  EvalAgentConfig,
  EvalEngine,
  EvalEngineOutput,
  EvalLogger,
  EvalStore,
  NewCaseResult,
  SuiteSnapshot,
} from './ports.js';

export interface EvalSuiteRunnerDeps {
  store: EvalStore;
  engine: EvalEngine;
  logger: EvalLogger;
}

export interface ReviewedCase {
  output: EvalEngineOutput;
  score: CaseScore;
  durationMs: number;
  ranAt: Date;
}

type SnapshotCase = SuiteSnapshot['cases'][number];

export const failureReason = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_CHARS);

/**
 * Executes one suite run in the background: the cases of the snapshot, in order,
 * ONE engine review each and never a retry (NFR-8). The first engine error fails
 * the whole run with the failing case and reason and null metrics (EC-7, D-7);
 * otherwise the run is scored by pure code (NFR-1) and finished in one
 * transaction. Works only from the snapshot taken at start, so later edits of
 * the agent or its cases cannot change it (EC-10, EC-27). Logs counts, names and
 * the failure reason, never diff or prompt text (NFR-3).
 */
export class EvalSuiteRunner {
  constructor(private deps: EvalSuiteRunnerDeps) {}

  /** One engine review of one case with the fixed inputs of AC-10, scored. */
  async reviewCase(agent: EvalAgentConfig, skillBlocks: string[], c: SnapshotCase): Promise<ReviewedCase> {
    const started = Date.now();
    const output = await this.deps.engine.review({
      provider: agent.provider,
      model: agent.model,
      strategy: agent.strategy,
      systemPrompt: agent.systemPrompt,
      skills: skillBlocks,
      task: EVAL_TASK_LINE,
      diff: c.inputDiff,
    });
    return {
      output,
      score: scoreCase(c.expected, output.findings),
      durationMs: Date.now() - started,
      ranAt: new Date(),
    };
  }

  /** Never rejects: every failure is recorded on the run (or logged if even that fails). */
  async execute(snap: SuiteSnapshot): Promise<void> {
    const { store, logger } = this.deps;
    const started = Date.now();
    const base = { agentId: snap.agent.id, version: snap.agent.version, cases: snap.cases.length };
    const results: NewCaseResult[] = [];
    const reviewed: { c: SnapshotCase; r: ReviewedCase }[] = [];
    let failing: string | null = null;
    let lastRanAt: Date | null = null;
    try {
      for (const c of snap.cases) {
        failing = c.name;
        const r = await this.reviewCase(snap.agent, snap.skillBlocks, c);
        failing = null;
        // Results are read back in `ran_at` order: keep it strictly increasing so
        // two reviews finishing in the same millisecond keep the case order.
        const ranAt: Date = lastRanAt && r.ranAt <= lastRanAt ? new Date(lastRanAt.getTime() + 1) : r.ranAt;
        lastRanAt = ranAt;
        reviewed.push({ c, r });
        results.push({
          caseId: c.id,
          suiteRunId: snap.runId,
          workspaceId: snap.workspaceId,
          agentId: snap.agent.id,
          caseName: c.name,
          expected: c.expected,
          ranAt,
          findings: r.output.findings,
          pass: r.score.pass,
          durationMs: r.durationMs,
          costUsd: r.output.costUsd,
          keptCount: r.output.keptCount,
          droppedCount: r.output.droppedCount,
          expectedCount: r.score.expectedCount,
          producedCount: r.score.producedCount,
        });
      }
      const score = scoreSuite(
        reviewed.map(({ c, r }) => ({
          expectation: c.expected,
          findings: r.output.findings,
          keptCount: r.output.keptCount,
          droppedCount: r.output.droppedCount,
          costUsd: r.output.costUsd,
        })),
      );
      failing = null;
      await store.finishSuiteRun(
        snap.workspaceId,
        snap.runId,
        {
          recall: score.recall,
          precision: score.precision,
          citationAccuracy: score.citationAccuracy,
          casesPassed: score.casesPassed,
          costUsd: score.costUsd,
        },
        results,
      );
      logger.info({ ...base, passed: score.casesPassed, durationMs: Date.now() - started }, 'eval: suite run done');
    } catch (err) {
      const reason = failureReason(err);
      logger.warn(
        { ...base, failingCase: failing, reason, durationMs: Date.now() - started },
        'eval: suite run failed',
      );
      try {
        await store.failSuiteRun(snap.workspaceId, snap.runId, { error: reason, failingCaseName: failing });
      } catch (persistErr) {
        logger.error({ ...base, reason: failureReason(persistErr) }, 'eval: could not record the failed suite run');
      }
    }
  }
}
