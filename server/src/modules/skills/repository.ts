import { and, count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type {
  AgentRef,
  NewSkill,
  SkillPatch,
  SkillRecord,
  SkillSummaryRecord,
  SkillsStore,
  SkillVersionRecord,
} from './ports.js';

/**
 * Skills data access: `skills` + `skill_versions`, and the reverse side of the
 * `agent_skills` link table ("used by"). The agent side of the links belongs to
 * the agents module. Every query that takes a skill id is workspace-scoped.
 */
export class SkillsRepository implements SkillsStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillSummaryRecord[]> {
    const rows = await this.db
      .select({ skill: t.skills, usedBy: count(t.agentSkills.agentId) })
      .from(t.skills)
      // Only enabled links count: an agent that keeps a skill unchecked in its
      // list doesn't use it.
      .leftJoin(
        t.agentSkills,
        and(eq(t.agentSkills.skillId, t.skills.id), eq(t.agentSkills.enabled, true)),
      )
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id)
      .orderBy(t.skills.name);
    return rows.map((r) => ({ ...r.skill, usedBy: r.usedBy }));
  }

  async get(workspaceId: string, id: string): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(workspaceId: string, skill: NewSkill): Promise<SkillRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ workspaceId, ...skill, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return row!;
    });
  }

  async update(workspaceId: string, id: string, patch: SkillPatch, bump: boolean): Promise<SkillRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({ ...patch, ...(bump ? { version: sql`${t.skills.version} + 1` } : {}) })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (row && bump) {
        await tx.insert(t.skillVersions).values({ skillId: row.id, version: row.version, body: row.body });
      }
      return row;
    });
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async usedBy(workspaceId: string, id: string): Promise<AgentRef[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agentSkills.skillId, id),
          eq(t.agentSkills.enabled, true),
          eq(t.agents.workspaceId, workspaceId),
        ),
      )
      .orderBy(t.agents.name);
  }

  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionRecord[]> {
    return this.db
      .select(getTableColumns(t.skillVersions))
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skills.workspaceId, workspaceId)))
      .orderBy(desc(t.skillVersions.version));
  }
}
