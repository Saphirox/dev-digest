import type { Skill, SkillSummary, SkillVersion } from '@devdigest/shared';
import type { SkillPatch, SkillRecord, SkillSummaryRecord, SkillVersionRecord } from './ports.js';

/** Pure skills transforms: record → DTO and the version-bump rule. No I/O. */

export function toSkillDto(r: SkillRecord): Skill {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    source: r.source,
    body: r.body,
    enabled: r.enabled,
    version: r.version,
    evidence_files: r.evidenceFiles ?? null,
  };
}

export function toSkillSummaryDto(r: SkillSummaryRecord): SkillSummary {
  return { ...toSkillDto(r), used_by: r.usedBy };
}

export function toSkillVersionDto(r: SkillVersionRecord): SkillVersion {
  return {
    skill_id: r.skillId,
    version: r.version,
    body: r.body,
    created_at: r.createdAt.toISOString(),
  };
}

/**
 * True when the patch changes what the skill contributes to a prompt (anything
 * but `enabled`). Such a change bumps the version and snapshots the body, so a
 * past run can always be traced to the exact text it used.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRecord, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}
