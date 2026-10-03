import type { CSSProperties } from "react";

export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({ color, display: "inline-flex", flexShrink: 0, marginTop: 2 }),
  main: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  refs: { display: "flex", flexWrap: "wrap", gap: "2px 12px" } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
