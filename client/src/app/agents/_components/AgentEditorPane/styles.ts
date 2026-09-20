import type { CSSProperties } from "react";

/** Co-located styles for AgentEditorPane (loading / error around the editor). */
export const s = {
  center: { flex: 1, display: "grid", placeItems: "center", padding: 24 } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
