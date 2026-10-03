import type { CSSProperties } from "react";

export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, lineHeight: 1.5 } satisfies CSSProperties,
  marker: { color: "var(--accent-text)", fontSize: 10, flexShrink: 0 } satisfies CSSProperties,
  reason: { color: "var(--text-secondary)", minWidth: 0 } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
