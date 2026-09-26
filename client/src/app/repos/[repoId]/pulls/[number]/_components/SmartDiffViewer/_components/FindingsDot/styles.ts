import type { CSSProperties } from "react";
import { FINDINGS_DOT_COLOR } from "../../constants";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 4 } satisfies CSSProperties,
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: FINDINGS_DOT_COLOR,
    flexShrink: 0,
  } satisfies CSSProperties,
  count: { fontSize: 12, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
