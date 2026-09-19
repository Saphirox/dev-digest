import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal (matches the mock). */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "12px 14px",
    marginBottom: 20,
    borderRadius: 8,
    background: "var(--accent-bg)",
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent)", marginTop: 2, flexShrink: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  enabledHint: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
