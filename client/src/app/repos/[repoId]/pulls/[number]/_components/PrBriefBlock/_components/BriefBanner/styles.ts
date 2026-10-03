import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  summaryBox: {
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
