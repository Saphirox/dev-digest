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
  diff: { borderTop: "1px solid var(--border)", background: "var(--bg-surface)" } satisfies CSSProperties,
  diffHead: { padding: "8px 14px", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  diffSame: { padding: "0 14px 12px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  add: { color: "var(--ok)" } satisfies CSSProperties,
  del: { color: "var(--crit)" } satisfies CSSProperties,
  diffBody: { margin: 0, padding: "0 0 10px", fontSize: 12.5, lineHeight: 1.6 } satisfies CSSProperties,
  diffLine: (kind: "same" | "add" | "del"): CSSProperties => ({
    padding: "0 14px",
    whiteSpace: "pre-wrap",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
    color: kind === "same" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
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
