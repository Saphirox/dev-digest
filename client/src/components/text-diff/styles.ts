import type { CSSProperties } from "react";

/** Co-located styles for TextDiff. */
export const s = {
  wrap: { borderTop: "1px solid var(--border)", background: "var(--bg-surface)" } satisfies CSSProperties,
  head: { padding: "8px 14px", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  same: { padding: "0 14px 12px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  add: { color: "var(--ok)" } satisfies CSSProperties,
  del: { color: "var(--crit)" } satisfies CSSProperties,
  body: { margin: 0, padding: "0 0 10px", fontSize: 12.5, lineHeight: 1.6 } satisfies CSSProperties,
  line: (kind: "same" | "add" | "del"): CSSProperties => ({
    padding: "0 14px",
    whiteSpace: "pre-wrap",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
    color: kind === "same" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
} as const;
