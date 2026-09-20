import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  tiles: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 } satisfies CSSProperties,
  tile: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  label: { fontSize: 12, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  value: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 20px" } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowIcon: { color: "var(--accent)" } satisfies CSSProperties,
  link: { fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
