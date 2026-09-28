import type { CSSProperties } from "react";

export const s = {
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
  } satisfies CSSProperties,
  rowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  symbolName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  callerBadge: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    marginTop: 8,
    paddingLeft: 30,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  callerList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  callerItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
  } satisfies CSSProperties,
  callerPlain: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chips: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  chipGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
  showMore: {
    alignSelf: "flex-start",
  } satisfies CSSProperties,
} as const;
