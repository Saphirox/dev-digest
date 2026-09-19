import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge, one per variant. */
export const s = {
  inline: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  compact: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
