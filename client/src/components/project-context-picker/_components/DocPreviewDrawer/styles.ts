import type { CSSProperties } from "react";

export const s = {
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
