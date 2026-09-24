import type { CSSProperties } from "react";
import type { Severity } from "@devdigest/shared";
import type { Line } from "./helpers";
import { SEV } from "@devdigest/ui";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  /** Wraps the path + its optional adornment. Carries the `flex: 1` that used
   *  to sit on `filePath`, so an adornment hugs the end of the path text
   *  instead of being pushed across to the `+N −M` stat. */
  pathWrap: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent). */
export function lineRowFor(kind: Line["kind"]): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return { display: "flex", alignItems: "stretch", fontSize: 13, lineHeight: "20px", background };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}

/** Colour for a severity marker/border. Reuses `@devdigest/ui`'s `SEV` token
 *  map so the palette stays in one place; an unrecognised severity renders
 *  nothing (byte-identical to a line with no severity). */
function severityColor(sev: Severity): string | undefined {
  return SEV[sev]?.c;
}

/** A 3px coloured left border for a flagged line, merged onto `lineRowFor`. */
export function severityBorderFor(sev: Severity): CSSProperties {
  const color = severityColor(sev);
  return color ? { borderLeft: `3px solid ${color}` } : {};
}

/** Icon+text severity badge rendered after the line text when a severity is
 *  set. Keeps the `severityColor`/`SEV` indirection (reuse `SEV`, no private
 *  colour map — the 0004 correctness fix) and adds a background read from
 *  `SEV[sev]?.bg` for the pill fill. */
export function lineBadge(sev: Severity): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    alignSelf: "center",
    flexShrink: 0,
    marginLeft: 8,
    marginRight: 4,
    padding: "0 6px",
    borderRadius: 4,
    fontSize: 10.5,
    fontWeight: 600,
    lineHeight: "16px",
    letterSpacing: "0.02em",
    textTransform: "lowercase",
    whiteSpace: "nowrap",
    color: severityColor(sev) ?? "var(--text-muted)",
    background: SEV[sev]?.bg ?? "var(--bg-hover)",
  };
}

/** Same visual as `lineBadge`, but reset for a `<button>` element so a click
 *  target is pixel-identical to the plain `<span>` badge. Used when the badge
 *  is interactive (deep-link to a finding); `lineBadge` itself is untouched
 *  so the non-interactive path stays byte-identical. */
export function lineBadgeButton(sev: Severity): CSSProperties {
  return {
    ...lineBadge(sev),
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
