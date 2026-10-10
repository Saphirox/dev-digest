import type { CSSProperties } from "react";

/** Co-located styles for ConfigureRun. */
export const s = {
  page: { padding: "32px 32px 44px", maxWidth: 900, margin: "0 auto", width: "100%" } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  intro: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 } satisfies CSSProperties,
  step: { display: "flex", alignItems: "center", gap: 10, marginTop: 28, marginBottom: 12 } satisfies CSSProperties,
  stepNum: (active: boolean): CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    background: active ? "var(--accent-bg)" : "var(--bg-hover)",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
  }),
  stepLabel: (active: boolean): CSSProperties => ({
    fontSize: 15,
    fontWeight: 600,
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),
  selectAll: { marginLeft: "auto" } satisfies CSSProperties,
  indent: { marginLeft: 34 } satisfies CSSProperties,
  selectWrap: { maxWidth: 520 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  hintLink: { fontSize: 14, color: "var(--accent-text)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 16, marginTop: 24, marginLeft: 34 } satisfies CSSProperties,
  estimate: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
