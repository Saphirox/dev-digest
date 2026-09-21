import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  /** One coloured circle per present severity, carrying its count as a
   *  visible text child — replaces the old single flat `findingDot`. Colour
   *  comes from the caller (`SEV[sev].c` / `.bg`), never a private map. */
  dot: (color: string, background: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 14,
    height: 14,
    padding: "0 3px",
    border: "none",
    borderRadius: 99,
    background,
    color,
    fontSize: 9.5,
    fontWeight: 700,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  }),
  /** The neutral fallback dot for a review the client cannot join to a
   *  severity — same shape, no count text. */
  fallbackDot: {
    width: 7,
    height: 7,
    padding: 0,
    border: "none",
    borderRadius: 99,
    background: "var(--text-muted)",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
