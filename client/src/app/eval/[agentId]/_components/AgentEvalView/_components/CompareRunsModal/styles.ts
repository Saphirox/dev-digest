import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  tile: { flex: 1, minWidth: 180, border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-surface)", padding: "14px 16px" } satisfies CSSProperties,
  tileLabel: { fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  tileRow: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginTop: 10 } satisfies CSSProperties,
  old: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
  arrow: { color: "var(--text-muted)", alignSelf: "center" } satisfies CSSProperties,
  newValue: (color: string, known: boolean): CSSProperties => ({ fontSize: 24, fontWeight: 700, color: known ? color : "var(--text-muted)" }),
  changes: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  diffBox: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" } satisfies CSSProperties,
  same: { padding: "12px 14px", fontSize: 13.5, color: "var(--text-secondary)", background: "var(--bg-surface)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  promote: { display: "flex", flexDirection: "column", gap: 4, maxWidth: 260 } satisfies CSSProperties,
  why: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  close: { marginRight: "auto" } satisfies CSSProperties,
} as const;
