import type { CSSProperties } from "react";

/** Co-located styles for RunHistory. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
