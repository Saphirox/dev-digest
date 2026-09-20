import type { CSSProperties } from "react";

/** Co-located styles for AgentsIndexPane (empty state / select prompt). */
export const s = {
  center: { flex: 1, display: "grid", placeItems: "center", padding: 24 } satisfies CSSProperties,
  empty: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 440 } satisfies CSSProperties,
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--accent)",
    marginBottom: 18,
  } satisfies CSSProperties,
  emptyTitle: { fontSize: 18, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
  emptyBody: { fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)", marginBottom: 20 } satisfies CSSProperties,
  emptyActions: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
