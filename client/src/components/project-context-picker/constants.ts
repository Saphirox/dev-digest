import type { SpecDocType } from "@devdigest/shared";

/** Text + tint per document type, from the theme's semantic tokens (matches the mock). */
export const DOC_TYPE_COLORS: Record<SpecDocType, { color: string; bg: string }> = {
  specs: { color: "var(--accent)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
};
