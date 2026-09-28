import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  count: {
    color: "var(--text-primary)",
    fontWeight: 700,
  } satisfies CSSProperties,
} as const;
