import type { CSSProperties } from "react";
import { LINE_HEIGHT } from "./constants";

const MONO = "var(--font-mono, ui-monospace, monospace)";
const LINE = `${LINE_HEIGHT}px`;

/** Co-located styles for BodyEditor (file header + line-numbered body). */
export const s = {
  frame: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  fileName: { fontWeight: 600 } satisfies CSSProperties,
  unsaved: {
    fontSize: 11,
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    borderRadius: 4,
    padding: "1px 6px",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  scroller: { display: "flex", maxHeight: 520, overflow: "auto", padding: "10px 0" } satisfies CSSProperties,
  gutter: {
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: LINE,
    flexShrink: 0,
    padding: "0 12px 0 14px",
    textAlign: "right",
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  textarea: (lines: number): CSSProperties => ({
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: LINE,
    flex: 1,
    minWidth: 0,
    height: lines * LINE_HEIGHT,
    padding: "0 14px 0 0",
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    background: "transparent",
    color: "var(--text-primary)",
  }),
} as const;
