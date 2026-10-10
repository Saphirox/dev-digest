import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown. */
export const s = {
  root: { position: "relative", display: "inline-block" } satisfies CSSProperties,
  popover: (width: number): CSSProperties => ({
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    width,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 6,
    zIndex: 40,
    animation: "ddpop .12s ease",
  }),
} as const;
