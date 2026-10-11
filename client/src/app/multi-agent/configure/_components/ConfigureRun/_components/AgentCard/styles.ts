import type { CSSProperties } from "react";

/** Co-located styles for AgentCard. */
export const s = {
  card: (checked: boolean): CSSProperties => ({
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid " + (checked ? "var(--accent)" : "var(--border)"),
    background: checked ? "var(--accent-bg)" : "var(--bg-elevated)",
  }),
  body: { display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 } satisfies CSSProperties,
  tile: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    color: "var(--accent)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 } satisfies CSSProperties,
  estimate: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
