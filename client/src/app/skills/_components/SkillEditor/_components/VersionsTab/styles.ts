import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  title: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  summary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    cursor: "pointer",
    listStyle: "none",
  } satisfies CSSProperties,
  date: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    margin: 0,
    padding: "12px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
