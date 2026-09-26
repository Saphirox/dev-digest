import type { CSSProperties } from "react";

/** Styled after `client/src/components/diff-viewer`'s `cs.outdatedWrap` /
 *  `cs.outdatedTitle` (duplicated, not imported — see `InlineFindings/styles.ts`
 *  for why). */
export const s = {
  wrap: {
    borderTop: "1px solid var(--border)",
    margin: "4px 14px 4px 58px",
    paddingTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
