/** Model-facing line rendering for `get_conventions` — presentation ring. */
import type { ConventionOutputItem } from './helpers.js';

export function renderConventionLine(c: ConventionOutputItem): string {
  return `[${c.status}] (${c.category}) ${c.rule} — ${c.evidence}`;
}
