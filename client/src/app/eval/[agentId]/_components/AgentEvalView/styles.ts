import type { CSSProperties } from "react";

/** Co-located styles for AgentEvalView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto", width: "100%" } satisfies CSSProperties,
  back: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 18 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 18, flexWrap: "wrap" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, margin: "18px 0", flexWrap: "wrap" } satisfies CSSProperties,
  card: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", padding: "16px 20px", marginBottom: 26 } satisfies CSSProperties,
  runsHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  selected: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  compare: { marginLeft: "auto" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
