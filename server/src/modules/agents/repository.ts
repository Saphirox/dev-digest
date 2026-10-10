import { and, asc, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentVersionConfig, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION, RUN_ESTIMATE_WINDOW } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow, LinkedSkillRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow, LinkedSkillRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  /** Project Context paths — NOT a config change (no version bump, D-13). */
  contextPaths?: string[];
}

/** `restoreVersion`'s outcome: the new row, or the snapshot skills that no longer exist (nothing written). */
export type RestoreResult = { row: AgentRow; missingSkillIds?: never } | { row?: never; missingSkillIds: string[] };

/** One entry of an agent's ordered skill set, as the Skills tab saves it. */
export interface SkillLinkInput {
  skillId: string;
  enabled: boolean;
}

/** What a review prompt needs from a skill. */
export interface PromptSkill {
  name: string;
  body: string;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
/** The DB or an open transaction: link changes and their version bump share one. */
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export class AgentsRepository {
  constructor(private db: Db) {}

  /**
   * Oldest first. Without an ORDER BY Postgres returns heap order, and an UPDATE
   * (e.g. toggling `enabled`) moves the row to the end, so the list reshuffled
   * on every edit.
   */
  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
  }

  /**
   * Per workspace agent: the mean `duration_ms` and mean `cost_usd` of its last
   * `RUN_ESTIMATE_WINDOW` `done` runs (any PR, newest `ran_at` first). `AVG`
   * skips NULLs, so an unknown cost never counts as free; no `done` run at all
   * → both NULL. Agents come back in list order.
   */
  async runEstimates(
    workspaceId: string,
  ): Promise<{ agentId: string; avgDurationMs: number | null; avgCostUsd: number | null }[]> {
    const ranked = this.db
      .select({
        agentId: t.agentRuns.agentId,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        rn: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc, ${t.agentRuns.id})`.as(
          'rn',
        ),
      })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.status, 'done')))
      .as('ranked');
    return this.db
      .select({
        agentId: t.agents.id,
        avgDurationMs: sql<number | null>`avg(${ranked.durationMs})::float8`,
        avgCostUsd: sql<number | null>`avg(${ranked.costUsd})::float8`,
      })
      .from(t.agents)
      .leftJoin(ranked, and(eq(ranked.agentId, t.agents.id), lte(ranked.rn, RUN_ESTIMATE_WINDOW)))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agents.id)
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.contextPaths !== undefined ? { contextPaths: patch.contextPaths } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /**
   * Restore a saved config as a new latest version, in one transaction: set the
   * config fields, replace the skill links with the snapshot's (in order, all
   * enabled), bump the version in SQL and snapshot it. `name`, `description`,
   * `enabled` and `context_paths` are not part of a snapshot and stay as they are.
   * Earlier snapshots are not touched. Returns `{ missingSkillIds }` (and writes
   * nothing) when a snapshot skill no longer exists in the workspace.
   */
  async restoreVersion(
    workspaceId: string,
    agentId: string,
    config: AgentVersionConfig,
  ): Promise<RestoreResult | undefined> {
    return this.db.transaction(async (tx) => {
      // Re-check the snapshot's skills inside the transaction and lock them
      // (FOR SHARE): a skill deleted after the service's pre-check is reported
      // as missing here instead of failing the link insert on its foreign key,
      // and a delete racing this restore waits for it to commit.
      if (config.skills.length > 0) {
        const live = new Set(
          (
            await tx
              .select({ id: t.skills.id })
              .from(t.skills)
              .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, config.skills)))
              .for('share')
          ).map((r) => r.id),
        );
        const missingSkillIds = config.skills.filter((id) => !live.has(id));
        if (missingSkillIds.length > 0) return { missingSkillIds };
      }
      const [row] = await tx
        .update(t.agents)
        .set({
          provider: config.provider,
          model: config.model,
          systemPrompt: config.system_prompt,
          outputSchema: (config.output_schema as object | null | undefined) ?? null,
          strategy: config.strategy,
          ciFailOn: config.ci_fail_on,
          repoIntel: config.repo_intel,
          version: sql`${t.agents.version} + 1`,
        })
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
        .returning();
      if (!row) return undefined;
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (config.skills.length > 0) {
        await tx
          .insert(t.agentSkills)
          .values(config.skills.map((skillId, i) => ({ agentId, skillId, enabled: true, order: i })));
      }
      await this.snapshotVersion(row, row.version, tx);
      return { row };
    });
  }

  private async snapshotVersion(row: AgentRow, version: number, db: Executor = this.db): Promise<void> {
    // Only the skills that actually reach the prompt: a disabled link or a
    // globally disabled skill doesn't shape what this version reviews with.
    const skills = (await this.linkedSkills(row.id, db))
      .filter((l) => l.enabled && l.skill.enabled)
      .map((l) => l.skill.id);
    await db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string, db: Executor = this.db): Promise<LinkedSkillRow[]> {
    const rows = await db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /**
   * Link a skill to an agent (idempotent: upserts order; default = last) and
   * bump the agent's version, in one transaction.
   */
  async linkSkill(workspaceId: string, agentId: string, skillId: string, order?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const resolved = order ?? (await this.linkedSkills(agentId, tx)).length;
      await tx
        .insert(t.agentSkills)
        .values({ agentId, skillId, order: resolved })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order: resolved },
        });
      await this.bumpVersion(workspaceId, agentId, tx);
    });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the agent's whole ordered skill set (order = index), keeping each
   * link's enabled flag, and bump the version. Skills not in the list are
   * unlinked. One transaction, so a failure can't leave the agent with an
   * emptied list or with links that no version snapshot records.
   */
  async setSkills(workspaceId: string, agentId: string, links: SkillLinkInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (links.length > 0) {
        await tx
          .insert(t.agentSkills)
          .values(links.map((l, i) => ({ agentId, skillId: l.skillId, enabled: l.enabled, order: i })));
      }
      await this.bumpVersion(workspaceId, agentId, tx);
    });
  }

  /** Enabled skills for the review prompt, in the agent's order (link AND skill enabled). */
  async enabledSkillsForPrompt(agentId: string): Promise<PromptSkill[]> {
    return this.db
      .select({ name: t.skills.name, body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
  }

  /**
   * `context_paths` of the agent's enabled skills (link AND skill enabled), in
   * link order — the skill half of a run's project context (AC-18/20).
   */
  async enabledSkillContextPaths(agentId: string): Promise<string[][]> {
    const rows = await this.db
      .select({ contextPaths: t.skills.contextPaths })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => r.contextPaths);
  }

  /** Enabled-link count per agent in the workspace (agents list card chip). */
  async skillCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, n: count() })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.agentId);
    return new Map(rows.map((r) => [r.agentId, r.n]));
  }

  /** Which of `skillIds` belong to the workspace (tenancy check before linking). */
  async skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * A skill-link change alters what the agent reviews with, so it is a config
   * change: bump the version and snapshot, like `update` does for its fields.
   * The increment happens in SQL, so concurrent saves get distinct versions.
   */
  private async bumpVersion(workspaceId: string, agentId: string, db: Executor): Promise<void> {
    const [row] = await db
      .update(t.agents)
      .set({ version: sql`${t.agents.version} + 1` })
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .returning();
    if (row) await this.snapshotVersion(row, row.version, db);
  }
}
