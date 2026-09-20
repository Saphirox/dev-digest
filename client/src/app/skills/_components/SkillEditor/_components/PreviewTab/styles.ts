import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  title: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  card: {
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "20px 24px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
