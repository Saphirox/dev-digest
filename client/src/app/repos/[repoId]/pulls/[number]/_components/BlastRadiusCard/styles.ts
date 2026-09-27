import type { CSSProperties } from "react";

export const s = {
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: 2,
    gap: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    padding: "4px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 5,
    border: active ? "1px solid var(--accent)" : "1px solid transparent",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,
  divider: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
