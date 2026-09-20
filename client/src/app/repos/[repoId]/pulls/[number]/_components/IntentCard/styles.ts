import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  chipWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  chipIcon: {
    color: "var(--warn)",
  } satisfies CSSProperties,
  chip: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--warn)",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  sentence: {
    margin: "0 0 16px",
    fontSize: 14.5,
    lineHeight: 1.55,
    color: "var(--text)",
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
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: ok ? "var(--ok)" : "var(--text-muted)",
    marginBottom: 8,
  }),
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: 13.5,
    lineHeight: 1.6,
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
