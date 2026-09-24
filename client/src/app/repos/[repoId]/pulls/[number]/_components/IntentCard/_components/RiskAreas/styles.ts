import type { CSSProperties } from "react";

export const s = {
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,
  rowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  rowMain: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  title: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--text)",
  } satisfies CSSProperties,
  body: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  explanation: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  refList: {
    margin: "8px 0 0",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
} as const;
