import type { ConventionCandidate } from "@devdigest/shared";
import { HIGH_CONFIDENCE } from "./constants";

/** `src/api/users.ts:23-31`, or `:23` for one line, or just the path. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_line" | "evidence_line_end">): string {
  if (c.evidence_line == null) return c.evidence_path;
  const end = c.evidence_line_end ?? c.evidence_line;
  return end > c.evidence_line ? `${c.evidence_path}:${c.evidence_line}-${end}` : `${c.evidence_path}:${c.evidence_line}`;
}

/** Whether the confidence bar shows green (high) rather than amber. */
export function isHighConfidence(c: Pick<ConventionCandidate, "confidence">): boolean {
  return c.confidence >= HIGH_CONFIDENCE;
}
