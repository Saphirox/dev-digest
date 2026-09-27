/** Model-facing line rendering for `get_blast_radius` — presentation ring. */
import type { BlastRadiusRecord, DownstreamImpactRecord } from './ports.js';
import { blastTotals, pluralize } from './helpers.js';

/** "N symbols, N callers, N endpoints, N crons" totals line, above the per-symbol lines. */
export function renderTotalsLine(pr: string, blast: BlastRadiusRecord): string {
  const t = blastTotals(blast);
  return `${pr}: ${pluralize(t.symbols, 'symbol')}, ${pluralize(t.callers, 'caller')}, ${pluralize(t.endpoints, 'endpoint')}, ${pluralize(t.crons, 'cron')}`;
}

/**
 * `name (file)` header, then one `← caller file:line` line per caller (or the
 * caller-supplied "no callers" text when there are none — that catalogue text
 * is owned by `modules/_shared/messages.ts`, not this pure render module),
 * then `endpoints:`/`crons:` lines when non-empty.
 */
function renderSymbolLines(d: DownstreamImpactRecord, noCallersText: string): string[] {
  const lines: string[] = [];
  lines.push(d.file ? `${d.symbol} (${d.file})` : d.symbol);
  if (d.callers.length === 0) {
    lines.push(`  ${noCallersText}`);
  } else {
    for (const c of d.callers) lines.push(`  ← ${c.file}:${c.line}`);
  }
  if (d.endpoints_affected.length > 0) lines.push(`  endpoints: ${d.endpoints_affected.join(', ')}`);
  if (d.crons_affected.length > 0) lines.push(`  crons: ${d.crons_affected.join(', ')}`);
  return lines;
}

/** The full `get_blast_radius` text body: totals line, then one block per changed symbol. */
export function renderBlastRadius(pr: string, blast: BlastRadiusRecord, noCallersText: string): string {
  const lines = [renderTotalsLine(pr, blast)];
  for (const d of blast.downstream) {
    lines.push(...renderSymbolLines(d, noCallersText));
  }
  return lines.join('\n');
}
