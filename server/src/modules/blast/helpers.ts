import type { BlastRadius, DownstreamImpact, PrHistoryItem } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';
import { MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';
import { PRIOR_PR_MAX_FILES, PRIOR_PR_MAX_RESULTS } from './constants.js';
import type { BlastPrFile } from './ports.js';

/**
 * Pure mapping: the facade's flat `BlastResult` (repo-intel/types.ts) →
 * the wire `BlastRadius` (Step 1). One `DownstreamImpact` per changed
 * symbol, INCLUDING symbols with 0 callers, so the client can render every
 * changed symbol even when nothing calls it.
 */
export function toBlastRadius(
  result: BlastResult,
  indexedSha: string | null,
  maxPerSymbol: number = MAX_CALLERS_PER_SYMBOL,
): BlastRadius {
  const factsByFile = result.factsByFile ?? {};

  const downstream: DownstreamImpact[] = result.changedSymbols.map((sym) => {
    const callers = result.callers
      .filter((c) => c.viaSymbol === sym.name && c.file !== sym.file)
      .sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line)
      .slice(0, maxPerSymbol);

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of callers) {
      const facts = factsByFile[c.file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const cr of facts.crons) crons.add(cr);
    }

    return {
      symbol: sym.name,
      file: sym.file,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints].sort(),
      crons_affected: [...crons].sort(),
      rank: callers.reduce((max, c) => Math.max(max, c.rank), 0),
    };
  });

  downstream.sort((a, b) => {
    const rankDiff = (b.rank ?? 0) - (a.rank ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const countDiff = b.callers.length - a.callers.length;
    if (countDiff !== 0) return countDiff;
    return a.symbol.localeCompare(b.symbol);
  });

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: null,
    degraded: result.degraded,
    reason: result.reason,
    indexed_sha: indexedSha,
  };
}

/** Top-N changed files (by additions+deletions) sampled for prior-PR history. */
export function pickHistoryFiles(files: BlastPrFile[]): string[] {
  return [...files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, PRIOR_PR_MAX_FILES)
    .map((f) => f.path);
}

/** One candidate commit's PR fan-out, plus which of our sampled files led to it. */
export interface PerShaResult {
  files: string[];
  prs: { number: number; title: string; author: string; merged_at: string | null }[];
}

/**
 * Merge per-sha PR candidates into `PrHistory` items: merged-only, current
 * PR dropped, deduped by PR number (a PR can surface via more than one
 * commit/file — its `files_overlap` is the union), sorted by overlap desc
 * then `merged_at` desc, capped at `PRIOR_PR_MAX_RESULTS`.
 */
export function mergePriorPrs(perSha: PerShaResult[], currentPrNumber: number): PrHistoryItem[] {
  const byNumber = new Map<
    number,
    { number: number; title: string; author: string; merged_at: string; files: Set<string> }
  >();
  for (const entry of perSha) {
    for (const pr of entry.prs) {
      if (pr.merged_at === null) continue;
      if (pr.number === currentPrNumber) continue;
      const existing = byNumber.get(pr.number);
      if (existing) {
        for (const f of entry.files) existing.files.add(f);
      } else {
        byNumber.set(pr.number, {
          number: pr.number,
          title: pr.title,
          author: pr.author,
          merged_at: pr.merged_at,
          files: new Set(entry.files),
        });
      }
    }
  }

  return [...byNumber.values()]
    .sort((a, b) => {
      const overlapDiff = b.files.size - a.files.size;
      if (overlapDiff !== 0) return overlapDiff;
      return b.merged_at.localeCompare(a.merged_at);
    })
    .slice(0, PRIOR_PR_MAX_RESULTS)
    .map((c) => ({
      pr_number: c.number,
      title: c.title,
      merged_at: c.merged_at,
      author: c.author,
      files_overlap: [...c.files].sort(),
      notes: '',
    }));
}
