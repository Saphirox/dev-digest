import type { CSSProperties } from "react";

export const s = {
  wrap: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", overflow: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "10px 14px", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  td: { padding: "12px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  tdStrong: { padding: "12px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", fontWeight: 600 } satisfies CSSProperties,
  version: { color: "var(--accent-text)" } satisfies CSSProperties,
  check: { width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent)" } satisfies CSSProperties,
  why: { display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 2, whiteSpace: "normal" } satisfies CSSProperties,
} as const;
