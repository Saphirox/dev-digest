import type { Skill } from "@devdigest/shared";
import type { SkillFormValues } from "../../../SkillForm";

export function toFormValues(skill: Pick<Skill, "name" | "description" | "type" | "body">): SkillFormValues {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/** True when any editable field differs from the saved skill. */
export function isDirty(values: SkillFormValues, skill: Skill): boolean {
  const saved = toFormValues(skill);
  return (Object.keys(saved) as (keyof SkillFormValues)[]).some((k) => values[k] !== saved[k]);
}
