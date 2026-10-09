import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseAction. */
export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  done: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--ok)",
  } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", flexBasis: "100%" } satisfies CSSProperties,
} as const;
