import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon per provenance, next to the source label on a rail card. */
export const SOURCE_ICONS: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Zap",
  community: "Globe",
  imported_url: "Link",
};
