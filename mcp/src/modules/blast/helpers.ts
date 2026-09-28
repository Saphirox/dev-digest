/** Pure select/shape helpers — no I/O. */
import type { BlastRadiusRecord } from './ports.js';

export interface BlastTotals {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * Deduped counts across every changed symbol's downstream impact — the same
 * shape the client's `BlastSummary` derives from the same record
 * (`client/src/app/.../BlastRadiusCard/helpers.ts`'s `blastTotals`, plan 0011
 * Step 10). Endpoints/crons are deduped (a caller file can affect more than
 * one changed symbol) so totals aren't double-counted.
 */
export function blastTotals(blast: BlastRadiusRecord): BlastTotals {
  let callers = 0;
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: blast.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** `"1 caller"` / `"2 callers"` — no i18n library here (plain text tool output,
 *  not client UI), so a plain singular/plural rule is enough: every noun this
 *  module pluralizes (`symbol`, `caller`, `endpoint`, `cron`) takes a regular
 *  `+s`. */
export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
