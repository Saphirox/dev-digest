import type { CSSProperties } from "react";

/** Co-located styles for the shared eval metric components. */
export const s = {
  tile: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
  } satisfies CSSProperties,
  tileTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  tileLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 } satisfies CSSProperties,
  tileValue: (color: string, known: boolean): CSSProperties => ({
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: known ? color : "var(--text-muted)",
  }),
  delta: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 13,
    fontWeight: 600,
    color,
  }),
  chartWrap: { width: "100%", height: 240 } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, justifyContent: "flex-end", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 12, height: 3, borderRadius: 2, background: color }),
  barWrap: { display: "inline-flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  barTrack: { display: "inline-block", width: 72, height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden" } satisfies CSSProperties,
  barFill: (color: string, value: number): CSSProperties => ({
    display: "block",
    height: "100%",
    width: `${Math.max(0, Math.min(1, value)) * 100}%`,
    background: color,
  }),
  barText: { fontSize: 12.5, color: "var(--text-secondary)", minWidth: 34, textAlign: "right" } satisfies CSSProperties,
  status: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12.5,
    fontWeight: 600,
    color,
  }),
} as const;
