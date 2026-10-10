import type { CSSProperties } from "react";

/** Co-located styles for AgentPickerPanel. */
export const s = {
  head: { display: "flex", alignItems: "center", padding: "6px 8px 8px" } satisfies CSSProperties,
  title: { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  clear: {
    marginLeft: "auto",
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--accent-text)",
    cursor: "pointer",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 6 } satisfies CSSProperties,
  rowLabel: { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  estimate: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  divider: { height: 1, background: "var(--border)", margin: "6px 0" } satisfies CSSProperties,
  muted: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 8px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    fontSize: 13.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  warn: { display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  action: { padding: "4px 2px" } satisfies CSSProperties,
} as const;
