import type { CSSProperties } from "react";

export const s = {
  button: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    cursor: "pointer",
    color: "var(--accent-text)",
    textDecoration: "none",
    textAlign: "left",
  } satisfies CSSProperties,
  text: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  wrap: { display: "inline-flex", alignItems: "baseline", gap: 6 } satisfies CSSProperties,
  newTag: { fontSize: 11.5, color: "var(--ok)", fontWeight: 600 } satisfies CSSProperties,
} as const;
