import { TAB_KEYS } from "./constants";
import type { Skill } from "@devdigest/shared";

/** Anything not written by hand in this studio came from outside: read it before enabling. */
export function isImported(skill: Pick<Skill, "source">): boolean {
  return skill.source !== "manual";
}

/** The `?tab=` value if it names a tab, else Config. */
export function resolveTab(requested: string | null): string {
  return requested && TAB_KEYS.includes(requested) ? requested : "config";
}
