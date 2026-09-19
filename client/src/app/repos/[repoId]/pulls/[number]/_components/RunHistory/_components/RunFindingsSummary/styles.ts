import type { CSSProperties } from "react";

/** Co-located styles for RunFindingsSummary. */
export const s = {
  countLine: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  chipsRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  blockers: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
