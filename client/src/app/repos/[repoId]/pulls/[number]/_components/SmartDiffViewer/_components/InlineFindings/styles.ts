import type { CSSProperties } from "react";

/**
 * Deliberately duplicated, not imported: `cs.thread` is an internal style in
 * `client/src/components/diff-viewer/comments.ts`, not exported from that
 * module's public `index.ts` barrel — the barrel stays narrow on purpose, so
 * a route component copies the tiny style instead of reaching past it.
 * Matches `client/src/components/diff-viewer/comments.ts`'s `cs.thread` —
 * the indented rail for a thread/composer under a code line.
 */
export const s = {
  thread: {
    margin: "6px 14px 8px 58px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
} as const;
