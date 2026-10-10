import { and, asc, count, desc, eq, getTableColumns, gte, inArray, sql } from 'drizzle-orm';
import type { EvalExpectation, EvalExpectationKind } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INTERRUPTED_REASON } from './constants.js';
import type {
  EvalCaseRecord,
  EvalCaseResultRecord,
  EvalFindingSource,
  EvalOverviewAgentRecord,
  EvalOverviewRunRecord,
  EvalPatchRow,
  EvalStore,
  EvalSuiteRunDetailRecord,
  EvalSuiteRunRecord,
  NewCaseResult,
  NewEvalCase,
  NewSuiteRun,
  SuiteMetrics,
} from './ports.js';

/** A suite run's columns without its (large) effective prompt. */
const { effectivePrompt: _effectivePrompt, ...RUN_COLUMNS } = getTableColumns(t.evalSuiteRuns);

/** The DB or an open transaction. */
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const AGENT_CASE = (workspaceId: string) =>
  and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent'));

/**
 * Evals data access: `eval_cases`, `eval_suite_runs`, `eval_runs` (case
 * results) and the read-only joins the dashboards need. Every list has a stable
 * ORDER BY, and every query is scoped by workspace except two on purpose:
 * `agentWorkspace` (it must tell a deleted agent, 409, from one in another
 * workspace, 404) and `reapRunning` (the global boot reaper).
 */
export class EvalsRepository implements EvalStore {
  constructor(private db: Db) {}

  // ---- finding → case ------------------------------------------------------

  async findingForEval(workspaceId: string, findingId: string): Promise<EvalFindingSource | undefined> {
    const [row] = await this.db
      .select({
        id: t.findings.id,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        title: t.findings.title,
        severity: t.findings.severity,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
        reviewId: t.reviews.id,
        agentId: t.reviews.agentId,
        prId: t.reviews.prId,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)));
    if (!row) return undefined;
    const { reviewId, agentId, prId, ...finding } = row;
    return { finding, review: { id: reviewId, agentId, prId } };
  }

  async agentWorkspace(agentId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ workspaceId: t.agents.workspaceId })
      .from(t.agents)
      .where(eq(t.agents.id, agentId));
    return row?.workspaceId;
  }

  async prFilesForPath(workspaceId: string, prId: string, path: string): Promise<EvalPatchRow[]> {
    return this.db
      .select({ id: t.prFiles.id, patch: t.prFiles.patch })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.prFiles.prId, t.pullRequests.id))
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prFiles.prId, prId), eq(t.prFiles.path, path)),
      )
      .orderBy(asc(t.prFiles.id));
  }

  // ---- cases ---------------------------------------------------------------

  async insertCase(values: NewEvalCase): Promise<EvalCaseRecord | null> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: 'agent',
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputMeta: values.inputMeta,
        expectedOutput: values.expectedOutput,
        notes: values.notes,
        sourceFindingId: values.sourceFindingId,
      })
      // The partial unique index on source_finding_id: a lost race returns no row.
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async caseForFinding(workspaceId: string, findingId: string): Promise<EvalCaseRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.sourceFindingId, findingId)));
    return row;
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.ownerId, agentId)))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalCases)
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.ownerId, agentId)));
    return row?.n ?? 0;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: { name?: string; expectedOutput?: EvalExpectation },
  ): Promise<EvalCaseRecord | undefined> {
    if (patch.name === undefined && patch.expectedOutput === undefined) return this.getCase(workspaceId, id);
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.expectedOutput !== undefined ? { expectedOutput: patch.expectedOutput } : {}),
      })
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async setCaseKind(workspaceId: string, id: string, kind: EvalExpectationKind): Promise<EvalCaseRecord | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        expectedOutput: sql`jsonb_set(${t.evalCases.expectedOutput}, '{kind}', to_jsonb(${kind}::text))`,
      })
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  /** Earlier case results keep their snapshot: `eval_runs.case_id` goes null (AC-31). */
  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(AGENT_CASE(workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async latestResults(workspaceId: string, caseIds: string[]): Promise<EvalCaseResultRecord[]> {
    if (caseIds.length === 0) return [];
    return this.db
      .selectDistinctOn([t.evalRuns.caseId])
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), inArray(t.evalRuns.caseId, caseIds)))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
  }

  // ---- suite runs ----------------------------------------------------------

  async insertSuiteRun(values: NewSuiteRun): Promise<EvalSuiteRunRecord | null> {
    const [row] = await this.db
      .insert(t.evalSuiteRuns)
      .values(values)
      // The partial unique index (one `running` run per agent) is the EC-8 guard.
      .onConflictDoNothing()
      .returning(RUN_COLUMNS);
    return row ?? null;
  }

  async runningSuiteRun(workspaceId: string, agentId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return row;
  }

  async finishSuiteRun(
    workspaceId: string,
    id: string,
    metrics: SuiteMetrics,
    results: NewCaseResult[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.insertResults(tx, workspaceId, results);
      await tx
        .update(t.evalSuiteRuns)
        .set({
          status: 'done',
          finishedAt: new Date(),
          recall: metrics.recall,
          precision: metrics.precision,
          citationAccuracy: metrics.citationAccuracy,
          casesPassed: metrics.casesPassed,
          costUsd: metrics.costUsd,
        })
        .where(
          and(
            eq(t.evalSuiteRuns.workspaceId, workspaceId),
            eq(t.evalSuiteRuns.id, id),
            eq(t.evalSuiteRuns.status, 'running'),
          ),
        );
    });
  }

  async failSuiteRun(
    workspaceId: string,
    id: string,
    failure: { error: string; failingCaseName: string | null },
  ): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        error: failure.error,
        failingCaseName: failure.failingCaseName,
        recall: null,
        precision: null,
        citationAccuracy: null,
        casesPassed: null,
        costUsd: null,
      })
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.id, id),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
  }

  async insertCaseResult(result: NewCaseResult): Promise<EvalCaseResultRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await this.insertResults(tx, result.workspaceId, [result]);
      return row!;
    });
  }

  /**
   * Insert case results. A case deleted while the run was in flight (EC-27) can
   * no longer be a foreign key target: lock the live cases (a concurrent delete
   * then waits for this transaction and nulls `case_id` itself) and store null
   * for the rest. The snapshot columns keep the result self-describing.
   */
  private async insertResults(
    tx: Executor,
    workspaceId: string,
    results: NewCaseResult[],
  ): Promise<EvalCaseResultRecord[]> {
    if (results.length === 0) return [];
    const live = new Set(
      (
        await tx
          .select({ id: t.evalCases.id })
          .from(t.evalCases)
          .where(
            and(
              eq(t.evalCases.workspaceId, workspaceId),
              inArray(t.evalCases.id, results.map((r) => r.caseId)),
            ),
          )
          .for('share')
      ).map((r) => r.id),
    );
    return tx
      .insert(t.evalRuns)
      .values(
        results.map((r) => ({
          caseId: live.has(r.caseId) ? r.caseId : null,
          suiteRunId: r.suiteRunId,
          workspaceId: r.workspaceId,
          agentId: r.agentId,
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
        })),
      )
      .returning();
  }

  async listSuiteRuns(workspaceId: string, agentId: string, since: Date | null): Promise<EvalSuiteRunRecord[]> {
    return this.db
      .select(RUN_COLUMNS)
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          since ? gte(t.evalSuiteRuns.startedAt, since) : undefined,
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));
  }

  async recentDoneRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalSuiteRunRecord[]> {
    return this.db
      .select(RUN_COLUMNS)
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }

  async getSuiteRun(workspaceId: string, id: string): Promise<EvalSuiteRunDetailRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row;
  }

  async caseResultsForRun(workspaceId: string, suiteRunId: string): Promise<EvalCaseResultRecord[]> {
    return this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.suiteRunId, suiteRunId)))
      .orderBy(asc(t.evalRuns.ranAt), asc(t.evalRuns.id));
  }

  async reapRunning(): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', error: INTERRUPTED_REASON, finishedAt: new Date() })
      .where(eq(t.evalSuiteRuns.status, 'running'))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }

  // ---- dashboard -----------------------------------------------------------

  async agentsWithCases(workspaceId: string): Promise<EvalOverviewAgentRecord[]> {
    return this.db
      .select({
        agentId: t.agents.id,
        agentName: t.agents.name,
        model: t.agents.model,
        provider: t.agents.provider,
        casesTotal: count(t.evalCases.id),
      })
      .from(t.agents)
      .innerJoin(
        t.evalCases,
        and(
          eq(t.evalCases.ownerId, t.agents.id),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.workspaceId, workspaceId),
        ),
      )
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agents.id)
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
  }

  async latestRun(workspaceId: string, agentId: string): Promise<EvalSuiteRunRecord | undefined> {
    const [row] = await this.db
      .select(RUN_COLUMNS)
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId)))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(1);
    return row;
  }

  async recentRuns(workspaceId: string, limit: number): Promise<EvalOverviewRunRecord[]> {
    return this.db
      .select({ ...RUN_COLUMNS, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.evalSuiteRuns.agentId, t.agents.id))
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }
}
