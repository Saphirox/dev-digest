import type { CSSProperties } from "react";

export const s = {
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    marginBottom: 14,
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  text: {
    flex: 1,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
