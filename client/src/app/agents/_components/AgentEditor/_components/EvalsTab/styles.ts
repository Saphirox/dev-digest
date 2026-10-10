import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  link: { marginLeft: "auto", fontSize: 13, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, marginBottom: 26, flexWrap: "wrap" } satisfies CSSProperties,
  casesHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" } satisfies CSSProperties,
  casesTitle: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  passing: { fontSize: 12.5, fontWeight: 600, color: "var(--ok)", background: "var(--ok-bg)", padding: "3px 9px", borderRadius: 5 } satisfies CSSProperties,
  headActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
