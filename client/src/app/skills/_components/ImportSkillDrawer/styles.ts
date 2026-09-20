import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
  } satisfies CSSProperties,
  picker: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "28px 16px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  description: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  markdown: {
    fontSize: 13.5,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 16px",
    background: "var(--bg-surface)",
    maxHeight: 360,
    overflow: "auto",
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 } satisfies CSSProperties,
  warning: { fontSize: 12.5, color: "var(--warn)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "space-between", width: "100%" } satisfies CSSProperties,
} as const;
