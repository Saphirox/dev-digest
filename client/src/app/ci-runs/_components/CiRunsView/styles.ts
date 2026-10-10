import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto", width: "100%" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headActions: { marginLeft: "auto" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--warn)", marginBottom: 14 } satisfies CSSProperties,
  tableWrap: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", overflow: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "10px 14px", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "12px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
