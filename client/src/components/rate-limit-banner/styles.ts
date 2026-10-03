import type { CSSProperties } from "react";

/** Co-located styles for RateLimitBanner. */
export const s = {
  banner: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--warn-bg)",
    padding: "6px 10px",
    borderRadius: 6,
  } satisfies CSSProperties,
} as const;
