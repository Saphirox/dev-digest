/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Line-badge text (Decision 12) — deliberately NOT `@devdigest/ui`'s
 *  `SEV[x].label` ("Critical"/"Warning"/"Suggestion"): the homework spec
 *  names these `blocker`/`warning`/`suggestion` for a line badge. */
export const LINE_BADGE_LABEL: Record<Severity, string> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
