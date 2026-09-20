import type { SkillSummary } from "@devdigest/shared";

/** Case-insensitive match on name, description and type. */
export function filterSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) =>
    [sk.name, sk.description, sk.type].some((field) => field.toLowerCase().includes(q)),
  );
}
