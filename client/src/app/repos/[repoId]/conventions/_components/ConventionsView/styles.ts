import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView (matches the Conventions mock). */
export const s = {
  page: { padding: "32px 40px 48px", maxWidth: 1080, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  meta: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  chips: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
