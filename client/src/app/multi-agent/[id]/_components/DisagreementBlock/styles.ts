import type { CSSProperties } from "react";

/** Co-located styles for DisagreementBlock. */
export const s = {
  wrap: { marginTop: 28 } satisfies CSSProperties,
  toggle: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" } satisfies CSSProperties,
  rows: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  row: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", overflow: "hidden" } satisfies CSSProperties,
  rowHead: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", fontSize: 14 } satisfies CSSProperties,
  loc: { fontSize: 13, fontWeight: 500 } satisfies CSSProperties,
  rowTitle: { fontWeight: 600 } satisfies CSSProperties,
  cells: (count: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
    borderTop: "1px solid var(--border)",
  }),
  cell: { padding: "12px 16px", borderLeft: "1px solid var(--border)", minWidth: 0 } satisfies CSSProperties,
  cellAgent: { fontSize: 13, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  cellState: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color,
  }),
  dot: (color: string): CSSProperties => ({ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }),
  cellMuted: { fontWeight: 400, letterSpacing: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  cellTitle: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.4 } satisfies CSSProperties,
  note: { fontSize: 13.5, color: "var(--text-muted)", padding: "8px 2px" } satisfies CSSProperties,
} as const;
