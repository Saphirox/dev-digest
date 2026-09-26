/** Constants for the SmartDiffViewer. */
import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Fixed group order, derived LOCALLY rather than imported as a value: a
 * runtime import of the vendored `SmartDiffRole` (a `z.enum`) 500s the page
 * under `next dev` (`client/INSIGHTS.md` 2026-09-19) — `SmartDiffRole` stays
 * an `import type` above, which keeps the `Record` below exhaustive under
 * `tsc` without ever being iterated at runtime.
 */
export const GROUP_ORDER = [
  "core",
  "tests",
  "wiring",
  "docs",
  "boilerplate",
] as const satisfies readonly SmartDiffRole[];
// Compile-time-only exhaustiveness check (`typescript-expert`: `Exclude<…>
// extends never`, not `satisfies` alone — `satisfies` only checks the listed
// members are valid, not that every member is listed). A role added to the
// contract without a display slot here fails `tsc`.
type _GroupOrderExhaustive = Exclude<SmartDiffRole, (typeof GROUP_ORDER)[number]> extends never ? true : never;
const _groupOrderIsExhaustive: _GroupOrderExhaustive = true;
void _groupOrderIsExhaustive;

/**
 * Per-role display policy. `dotColor` is gone (Decision 9 — a second
 * coloured dot next to `FindingsDot`'s count read as two counters in one
 * header); `filesCollapsed` replaces `defaultOpen` (Decision 10: docs and
 * boilerplate file cards start collapsed, every other role obeys
 * `AUTO_EXPAND_MAX_LINES` instead of a per-role flag).
 */
export const GROUP_META: Record<SmartDiffRole, { labelKey: string; blurbKey: string; filesCollapsed: boolean }> = {
  core: { labelKey: "coreLabel", blurbKey: "coreBlurb", filesCollapsed: false },
  tests: { labelKey: "testsLabel", blurbKey: "testsBlurb", filesCollapsed: false },
  wiring: { labelKey: "wiringLabel", blurbKey: "wiringBlurb", filesCollapsed: false },
  docs: { labelKey: "docsLabel", blurbKey: "docsBlurb", filesCollapsed: true },
  boilerplate: { labelKey: "boilerplateLabel", blurbKey: "boilerplateBlurb", filesCollapsed: true },
};

/** The plain per-file "has findings" dot and the group header's `● N` count
 *  share this colour — a fixed, deliberately non-severity colour (Decision
 *  11: one plain, non-clickable dot per file, not a per-severity marker). */
export const FINDINGS_DOT_COLOR = "var(--crit)";
