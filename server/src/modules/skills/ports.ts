import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Skills ports. What SkillsService needs from the outside world, declared next
 * to the service (dependency inversion): SkillsRepository implements
 * SkillsStore; tests pass a fake. Record shapes are structural subsets of the
 * Drizzle rows, so helpers.ts stays pure.
 */

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

export interface SkillSummaryRecord extends SkillRecord {
  /** Agents with an enabled link to this skill. */
  usedBy: number;
}

export interface SkillVersionRecord {
  skillId: string;
  version: number;
  body: string;
  createdAt: Date;
}

export interface NewSkill {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface AgentRef {
  id: string;
  name: string;
}

export interface SkillsStore {
  list(workspaceId: string): Promise<SkillSummaryRecord[]>;
  /** Workspace-scoped lookup (tenancy guard). */
  get(workspaceId: string, id: string): Promise<SkillRecord | undefined>;
  /** Insert a skill and snapshot its first version. */
  insert(workspaceId: string, skill: NewSkill): Promise<SkillRecord>;
  /**
   * Apply a patch. With `bump`, also increment `version` (in SQL, so
   * concurrent saves get distinct versions) and snapshot the new body,
   * atomically. Undefined when the skill isn't in the workspace.
   */
  update(workspaceId: string, id: string, patch: SkillPatch, bump: boolean): Promise<SkillRecord | undefined>;
  /** Delete; agent links and versions cascade. False when not in the workspace. */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** Agents (in the workspace) with an ENABLED link to this skill. */
  usedBy(workspaceId: string, id: string): Promise<AgentRef[]>;
  /** Body history, newest first; empty when the skill isn't in the workspace. */
  listVersions(workspaceId: string, skillId: string): Promise<SkillVersionRecord[]>;
}
