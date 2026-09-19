import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. Modal pads its footer but not its body. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginRight: "auto" } satisfies CSSProperties,
} as const;
