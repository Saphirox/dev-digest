import type { CSSProperties } from "react";

/** Co-located styles for the SkillEditor shell (mirrors the agent editor). */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  iconBox: (color: string, bg: string): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    background: bg,
    color,
    display: "grid",
    placeItems: "center",
  }),
  name: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
  inner: { maxWidth: 880 } satisfies CSSProperties,
} as const;
