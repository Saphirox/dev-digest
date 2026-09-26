import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  chevronBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  blurb: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  reviewNotRun: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  count: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  files: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is expanded — matches
 *  `client/src/components/diff-viewer`'s `chevronFor` (duplicated, not
 *  imported: that helper isn't part of `diff-viewer`'s public `index.ts`
 *  barrel, which stays narrow on purpose). */
export function chevronFor(expanded: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
