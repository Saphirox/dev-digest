import type { CSSProperties } from "react";

/** Co-located styles for MultiRunResults. */
export const s = {
  page: { padding: "20px 32px 44px", width: "100%" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  sub: { fontSize: 13.5, color: "var(--text-muted)" } satisfies CSSProperties,
  toggle: {
    marginLeft: "auto",
    display: "inline-flex",
    padding: 2,
    gap: 2,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  toggleBtn: (on: boolean): CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 6,
    border: "none",
    fontSize: 13,
    fontWeight: on ? 600 : 500,
    color: on ? "var(--text-primary)" : "var(--text-muted)",
    background: on ? "var(--bg-hover)" : "transparent",
    cursor: "pointer",
  }),
  prRow: { display: "flex", alignItems: "center", gap: 10, margin: "14px 0 18px", flexWrap: "wrap" } satisfies CSSProperties,
  prNumber: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  prTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  totals: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  columns: (count: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${count}, minmax(240px, 1fr))`,
    gap: 14,
    overflowX: "auto",
    alignItems: "stretch",
  }),
  loading: { padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
