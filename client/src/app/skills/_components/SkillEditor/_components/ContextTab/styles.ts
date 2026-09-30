import type { CSSProperties } from "react";

export const s = {
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  serializes: { maxWidth: 1000, marginTop: 20 } satisfies CSSProperties,
  serializesLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  serializesBox: {
    margin: 0,
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
