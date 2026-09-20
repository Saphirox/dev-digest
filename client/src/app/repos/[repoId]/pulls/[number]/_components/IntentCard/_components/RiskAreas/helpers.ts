import type { RiskRef } from "@devdigest/shared";

/** `"path:12-18"`, or `"path:34"` when `start_line === end_line`. */
export function formatRef(ref: RiskRef): string {
  return ref.start_line === ref.end_line
    ? `${ref.file}:${ref.start_line}`
    : `${ref.file}:${ref.start_line}-${ref.end_line}`;
}
