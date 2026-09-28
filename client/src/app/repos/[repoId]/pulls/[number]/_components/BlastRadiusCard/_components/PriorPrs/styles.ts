import type { CSSProperties } from "react";

export const s = {
  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  title: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-muted)",
    flex: 1,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : undefined,
    transition: "transform .12s",
  }),
  body: {
    marginTop: 10,
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  item: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  overlap: {
    marginLeft: "auto",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
