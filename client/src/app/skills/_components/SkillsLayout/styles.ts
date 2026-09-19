import type { CSSProperties } from "react";

/** Co-located styles for SkillsLayout: rail on the left, editor on the right. */
export const s = {
  frame: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  pane: { flex: 1, display: "flex", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  center: { flex: 1, display: "grid", placeItems: "center" } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
