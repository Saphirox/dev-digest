import type { CSSProperties } from "react";

/** Co-located styles for CiTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", flexWrap: "wrap" } satisfies CSSProperties,
  repo: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  add: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px", border: "1px dashed var(--border-strong)", borderRadius: 8, background: "transparent", color: "var(--text-secondary)", fontSize: 14, width: "100%" } satisfies CSSProperties,
  failOn: { maxWidth: 360, marginTop: 10 } satisfies CSSProperties,
} as const;
