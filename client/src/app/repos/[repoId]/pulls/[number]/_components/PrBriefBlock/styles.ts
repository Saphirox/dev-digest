import type { CSSProperties } from "react";

export const s = {
  block: { display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  status: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
  cta: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  ctaText: { flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  ctaTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  ctaBody: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  ctaAction: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 } satisfies CSSProperties,
  missing: { fontSize: 12.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
