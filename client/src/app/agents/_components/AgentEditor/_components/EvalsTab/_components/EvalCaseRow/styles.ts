import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseRow. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  sub: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  status: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    width: 84,
    fontSize: 12.5,
    fontWeight: 600,
    color,
  }),
  tags: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  actions: { display: "flex", gap: 2, flexShrink: 0 } satisfies CSSProperties,
} as const;
