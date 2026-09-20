import type { CSSProperties } from "react";

/** Co-located styles for SkillsLayout: rail on the left, the page on the right. */
export const s = {
  frame: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  pane: { flex: 1, display: "flex", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
} as const;
