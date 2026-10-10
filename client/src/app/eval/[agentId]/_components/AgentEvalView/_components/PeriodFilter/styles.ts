import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  select: {
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
