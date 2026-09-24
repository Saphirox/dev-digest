/** Constants for the SmartDiffViewer. */
import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Fixed group order, derived LOCALLY rather than imported as a value: a
 * runtime import of the vendored `SmartDiffRole` (a `z.enum`) 500s the page
 * under `next dev` (`client/INSIGHTS.md` 2026-09-19) — `SmartDiffRole` stays
 * an `import type` above, which keeps the `Record` below exhaustive under
 * `tsc` without ever being iterated at runtime.
 */
export const GROUP_ORDER = ["core", "wiring", "boilerplate"] as const satisfies readonly SmartDiffRole[];

/**
 * `dotColor` is an extra field on the SAME record rather
 * than parallel `Record<SmartDiffRole, …>`s — `GROUP_META` already owns
 * per-role render policy (`defaultOpen`), so a second record would just be a
 * second place to keep in sync with `SmartDiffRole`.
 *
 */
export const GROUP_META: Record<
  SmartDiffRole,
  { labelKey: string; blurbKey: string; defaultOpen: boolean; dotColor: string }
> = {
  core: {
    labelKey: "groups.core.label",
    blurbKey: "groups.core.blurb",
    defaultOpen: true,
    dotColor: "var(--accent)",
  },
  wiring: {
    labelKey: "groups.wiring.label",
    blurbKey: "groups.wiring.blurb",
    defaultOpen: true,
    dotColor: "var(--warn)",
  },
  boilerplate: {
    labelKey: "groups.boilerplate.label",
    blurbKey: "groups.boilerplate.blurb",
    defaultOpen: false,
    dotColor: "var(--text-muted)",
  },
};
