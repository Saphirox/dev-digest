import type { CSSProperties } from "react";

export const s = {
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  sentence: {
    margin: "0 0 16px",
    fontSize: 14.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginBottom: 16,
  } satisfies CSSProperties,
  columnLabel: (ok: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: ok ? "var(--ok)" : "var(--text-muted)",
    marginBottom: 8,
  }),
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: 13,
    lineHeight: 1.6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  listItem: (inScope: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    color: inScope ? "var(--text-secondary)" : "var(--text-muted)",
    opacity: inScope ? 1 : 0.75,
  }),
  bullet: {
    color: "inherit",
    opacity: 0.6,
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  risksWrap: {
    marginTop: 4,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  missing: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
