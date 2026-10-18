import type { CSSProperties } from "react";

/** Co-located styles for AgentTabs. */
export const s = {
  panel: { padding: "20px 0", display: "flex", flexDirection: "column", gap: 12, maxWidth: 940 } satisfies CSSProperties,
  summary: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "16px 18px",
    border: "1px solid var(--border)",
    borderLeft: "3px solid var(--accent)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  summaryMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  agentName: { fontSize: 15, fontWeight: 600, color: "var(--accent-text)" } satisfies CSSProperties,
  summaryText: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } satisfies CSSProperties,
  failed: { fontSize: 13.5, color: "var(--crit)", marginTop: 4, lineHeight: 1.5 } satisfies CSSProperties,
  side: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  note: { fontSize: 13.5, color: "var(--text-muted)", padding: "12px 4px" } satisfies CSSProperties,
} as const;
