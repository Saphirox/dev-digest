import type { CSSProperties } from "react";

/** Co-located styles for SeverityPills. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 14,
  } satisfies CSSProperties,
  // The pill itself is a SeverityBadge; this button only adds the affordance.
  // `dimmed` fades the pills that are NOT the active filter, so the current
  // selection reads at a glance without recolouring the badge.
  pill: (active: boolean, anyActive: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    padding: 0,
    borderRadius: 5,
    cursor: "pointer",
    display: "inline-flex",
    outline: active ? "1px solid var(--text-secondary)" : "none",
    outlineOffset: 2,
    opacity: anyActive && !active ? 0.45 : 1,
    transition: "opacity .12s",
  }),
} as const;
