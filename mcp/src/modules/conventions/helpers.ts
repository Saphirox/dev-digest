/** Pure select/shape helpers — no I/O. */
import type { ConventionRecord } from './ports.js';

/** Accepted first, then the rest in scan order, sliced to `limit` (default 50). */
export function selectConventions(conventions: ConventionRecord[], limit = 50): ConventionRecord[] {
  const accepted = conventions.filter((c) => c.status === 'accepted');
  const rest = conventions.filter((c) => c.status !== 'accepted');
  return [...accepted, ...rest].slice(0, limit);
}

/** `get_conventions` row shape: `evidence` is `'path:line'`, or just `'path'` when no line is known. */
export interface ConventionOutputItem {
  rule: string;
  category: string;
  status: string;
  evidence: string;
}

export function toConventionItem(c: ConventionRecord): ConventionOutputItem {
  return {
    rule: c.rule,
    category: c.category,
    status: c.status,
    evidence: c.evidence_line != null ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path,
  };
}
