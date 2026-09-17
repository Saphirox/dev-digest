import type { CSSProperties } from "react";

/** Co-located styles for FindingsPreviewCard. */
export const s = {
  // A bare severity chip: colour-matched icon + number, dotted underline as the
  // "hover me" affordance. No background/radius/padding — that is the pill look
  // of SeverityBadge, which the design explicitly does not use here.
  chip: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color,
    fontSize: 13,
    lineHeight: 1.4,
    // border-bottom, not text-decoration: the underline has to run under the
    // icon too, and text-decoration does not cross an inline-flex child.
    borderBottom: `1px dotted ${color}`,
    paddingBottom: 1,
    cursor: "default",
  }),
  confDot: (color: string): CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: 99,
    background: color,
  }),
  conf: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // position:fixed so the card escapes the timeline card's overflow clipping;
  // it is anchored to the hovered element's viewport rect by the caller.
  card: (top: number, left: number): CSSProperties => ({
    position: "fixed",
    top,
    left,
    zIndex: 60,
    width: 400,
    maxHeight: 340,
    overflowY: "auto",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    boxShadow: "0 12px 32px rgba(0,0,0,.45)",
    cursor: "default",
  }),
  title: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  item: {
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  } satisfies CSSProperties,
  file: {
    fontSize: 12,
    color: "var(--accent)",
  } satisfies CSSProperties,
  rationale: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
