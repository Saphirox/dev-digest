import type { SkillType } from "@devdigest/shared";

/** Text + tint per skill type, from the theme's semantic tokens (matches the mock). */
export const TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--info)", bg: "var(--info-bg)" },
};

/** Every skill type, in select order (keys of TYPE_COLORS, so the compiler keeps it complete). */
export const SKILL_TYPES = Object.keys(TYPE_COLORS) as SkillType[];
