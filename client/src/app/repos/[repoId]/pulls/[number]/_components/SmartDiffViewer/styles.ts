import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  stats: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  statsAdd: { color: "var(--code-add-text)" } satisfies CSSProperties,
  statsDel: { color: "var(--code-del-text)" } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
  }),
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  groupDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  groupLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  groupBlurb: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  groupCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  groupFiles: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
