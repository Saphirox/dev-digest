import type { CSSProperties } from "react";

export const s = {
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 7px",
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,
  line: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    padding: "10px 16px",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  lineIcon: { color: "var(--accent-text)", flexShrink: 0, alignSelf: "center" } satisfies CSSProperties,
  label: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
} as const;
