import type { Skill } from "@devdigest/shared";

/** Anything not written by hand in this studio came from outside: read it before enabling. */
export function isImported(skill: Pick<Skill, "source">): boolean {
  return skill.source !== "manual";
}
