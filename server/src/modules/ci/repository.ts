import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AgentManifest, type CiVerdict } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import { NotFoundError } from '../../platform/errors.js';
import * as t from '../../db/schema.js';
import type {
  CiInstallationRecord,
  CiRunInput,
  CiRunRecord,
  CiStore,
} from './ports.js';

/** The CI Runs page shows the newest rows only. */
const LIST_RUNS_LIMIT = 200;

const VERDICTS: readonly string[] = ['passed', 'changes_requested', 'failed'];
const asVerdict = (v: string | null): CiVerdict =>
  VERDICTS.includes(v ?? '') ? (v as CiVerdict) : 'failed';

/**
 * ci data access: `ci_installations`, `ci_runs`, and the `agent_runs` +
 * `run_traces` rows an ingested run writes. Every query is workspace-scoped,
 * through `agents.workspace_id` or `ci_runs.workspace_id`.
 */
export class CiRepository implements CiStore {
  constructor(private db: Db) {}

  async findInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<CiInstallationRecord | undefined> {
    const [row] = await this.db
      .select({ inst: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.repo, repo)))
      .orderBy(desc(t.ciInstallations.installedAt))
      .limit(1);
    return row ? toInstallation(row.inst, row.agentName, null) : undefined;
  }

  async upsertInstallation(
    workspaceId: string,
    agentId: string,
    repo: string,
    agentVersion: number,
    manifest: AgentManifest,
  ): Promise<CiInstallationRecord> {
    const id = await this.db.transaction(async (tx) => {
      // The agent must belong to the workspace; otherwise nothing is written.
      const [owned] = await tx
        .select({ id: t.agents.id })
        .from(t.agents)
        .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
        .limit(1);
      if (!owned) throw new NotFoundError('Agent not found');
      const [existing] = await tx
        .select({ id: t.ciInstallations.id })
        .from(t.ciInstallations)
        .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
        .where(
          and(
            eq(t.agents.workspaceId, workspaceId),
            eq(t.ciInstallations.agentId, agentId),
            eq(t.ciInstallations.repo, repo),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(t.ciInstallations)
          .set({ agentVersion, manifest })
          .where(eq(t.ciInstallations.id, existing.id));
        return existing.id;
      }
      const [created] = await tx
        .insert(t.ciInstallations)
        .values({ agentId, repo, targetType: 'gha', agentVersion, manifest })
        .returning({ id: t.ciInstallations.id });
      return created!.id;
    });
    const [row] = await this.db
      .select({ inst: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.id, id)));
    if (!row) throw new NotFoundError('CI installation not found');
    const latest = await this.latestRunsByRepo(workspaceId, [repo]);
    return toInstallation(row.inst, row.agentName, latest.get(repo) ?? null);
  }

  async listInstallations(workspaceId: string, agentId?: string): Promise<CiInstallationRecord[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
        ),
      )
      .orderBy(desc(t.ciInstallations.installedAt));
    const latest = await this.latestRunsByRepo(
      workspaceId,
      rows.map((r) => r.inst.repo),
    );
    return rows.map((r) => toInstallation(r.inst, r.agentName, latest.get(r.inst.repo) ?? null));
  }

  async storedAttempt(workspaceId: string, githubRunId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ attempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.githubRunId, githubRunId)));
    return row ? (row.attempt ?? 0) : null;
  }

  async saveCiRun(workspaceId: string, input: CiRunInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ agentRunId: t.ciRuns.agentRunId })
        .from(t.ciRuns)
        .where(
          and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.githubRunId, input.githubRunId)),
        );

      let agentRunId: string | null = null;
      const run = input.agentRun;
      if (run) {
        const values = {
          workspaceId,
          agentId: input.agentId,
          prId: null,
          ranAt: input.ranAt ?? new Date(),
          provider: 'openrouter',
          model: run.model,
          durationMs: run.durationMs,
          costUsd: run.costUsd,
          status: run.status,
          error: run.error,
          source: 'ci' as const,
          findingsCount: run.findingsCount,
        };
        if (existing?.agentRunId) {
          // A re-run attempt replaces the stored values of the same run.
          await tx.update(t.agentRuns).set(values).where(eq(t.agentRuns.id, existing.agentRunId));
          agentRunId = existing.agentRunId;
        } else {
          const [created] = await tx
            .insert(t.agentRuns)
            .values(values)
            .returning({ id: t.agentRuns.id });
          agentRunId = created!.id;
        }
        await tx
          .insert(t.runTraces)
          .values({ runId: agentRunId, trace: run.trace })
          .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace: run.trace } });
      } else if (existing?.agentRunId) {
        // The latest attempt produced no valid result: drop the earlier attempt's run.
        await tx.delete(t.agentRuns).where(eq(t.agentRuns.id, existing.agentRunId));
      }

      const row = {
        ciInstallationId: input.installationId,
        workspaceId,
        repo: input.repo,
        githubRunId: input.githubRunId,
        runAttempt: input.runAttempt,
        agentRunId,
        prNumber: input.prNumber,
        ranAt: input.ranAt,
        status: input.verdict,
        findingsCount: run?.findingsCount ?? null,
        costUsd: run?.costUsd ?? null,
        githubUrl: input.githubUrl,
        source: 'ci',
      };
      await tx
        .insert(t.ciRuns)
        .values(row)
        .onConflictDoUpdate({ target: [t.ciRuns.workspaceId, t.ciRuns.githubRunId], set: row });
    });
  }

  async listRuns(workspaceId: string): Promise<CiRunRecord[]> {
    const instAgent = alias(t.agents, 'inst_agent');
    const rows = await this.db
      .select({
        id: t.ciRuns.id,
        repo: t.ciRuns.repo,
        prNumber: t.ciRuns.prNumber,
        runAgentName: t.agents.name,
        instAgentName: instAgent.name,
        verdict: t.ciRuns.status,
        findingsCount: t.ciRuns.findingsCount,
        costUsd: t.ciRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        githubUrl: t.ciRuns.githubUrl,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .leftJoin(t.agentRuns, eq(t.ciRuns.agentRunId, t.agentRuns.id))
      .leftJoin(t.agents, eq(t.agentRuns.agentId, t.agents.id))
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(instAgent, eq(t.ciInstallations.agentId, instAgent.id))
      .where(eq(t.ciRuns.workspaceId, workspaceId))
      .orderBy(sql`${t.ciRuns.ranAt} desc nulls last`, desc(t.ciRuns.id))
      .limit(LIST_RUNS_LIMIT);
    return rows.map((r) => ({
      id: r.id,
      repo: r.repo,
      prNumber: r.prNumber,
      agentName: r.runAgentName ?? r.instAgentName ?? null,
      verdict: asVerdict(r.verdict),
      findingsCount: r.findingsCount,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      githubUrl: r.githubUrl,
      ranAt: r.ranAt,
    }));
  }

  /** Latest ingested run per repo (verdict + time), for the installation rows. */
  private async latestRunsByRepo(
    workspaceId: string,
    repos: string[],
  ): Promise<Map<string, { verdict: CiVerdict; ranAt: Date | null }>> {
    const out = new Map<string, { verdict: CiVerdict; ranAt: Date | null }>();
    if (repos.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.ciRuns.repo], {
        repo: t.ciRuns.repo,
        status: t.ciRuns.status,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.workspaceId, workspaceId), inArray(t.ciRuns.repo, repos)))
      .orderBy(t.ciRuns.repo, sql`${t.ciRuns.ranAt} desc nulls last`);
    for (const r of rows) {
      if (r.repo) out.set(r.repo, { verdict: asVerdict(r.status), ranAt: r.ranAt });
    }
    return out;
  }
}

function toInstallation(
  inst: typeof t.ciInstallations.$inferSelect,
  agentName: string,
  latestRun: { verdict: CiVerdict; ranAt: Date | null } | null,
): CiInstallationRecord {
  const manifest = AgentManifest.safeParse(inst.manifest);
  return {
    id: inst.id,
    agentId: inst.agentId,
    agentName,
    repo: inst.repo,
    targetType: inst.targetType,
    installedAt: inst.installedAt,
    agentVersion: inst.agentVersion,
    manifest: manifest.success ? manifest.data : null,
    latestRun,
  };
}
