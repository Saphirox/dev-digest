import type { IconName } from "@devdigest/ui";
import type { RiskKind } from "@devdigest/shared";

/**
 * One glyph per risk kind — a local `Record<RiskKind, …>` so `tsc` forces a
 * new detector kind to also get a glyph, with NO runtime import of the zod
 * enum (`RiskKind.options` 500s `next dev`; client/INSIGHTS.md — import
 * shared contracts as types only). Note: lucide has no `Package` in this
 * registry — `Boxes` is the package glyph.
 */
export const RISK_ICON: Record<RiskKind, IconName> = {
  auth_surface: "Shield",
  new_dependency: "Boxes",
  performance: "Zap",
};
