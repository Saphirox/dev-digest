import type { ConventionCandidate } from "@devdigest/shared";

/** `src/api/users.ts:23-31`, or `:23` for one line, or just the path. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_line" | "evidence_line_end">): string {
  if (c.evidence_line == null) return c.evidence_path;
  const end = c.evidence_line_end ?? c.evidence_line;
  return end > c.evidence_line ? `${c.evidence_path}:${c.evidence_line}-${end}` : `${c.evidence_path}:${c.evidence_line}`;
}

/** Green from this confidence up, amber below (the mock's 91% / 78%). */
export const HIGH_CONFIDENCE = 0.8;
