import type { ProjectContextEntry, SpecDocType } from '@devdigest/shared';
import { DOC_TYPE_FOLDERS, FALLBACK_DOC_TYPE, MAX_DOC_TOKENS, MAX_RUN_TOKENS } from './constants.js';

/** Document type from the folder nearest to the file (`docs/specs/x.md` → `specs`) (EC-6). */
export function docTypeFor(path: string): SpecDocType {
  const folders = path.split('/').slice(0, -1);
  for (let i = folders.length - 1; i >= 0; i--) {
    const seg = folders[i]!;
    if ((DOC_TYPE_FOLDERS as readonly string[]).includes(seg)) return seg as SpecDocType;
  }
  return FALLBACK_DOC_TYPE;
}

/**
 * Run order (AC-18/19): the agent's paths, then each enabled skill's paths in
 * link order; a path repeated anywhere is kept once, at its first position.
 */
export function mergeContextPaths(
  agentPaths: readonly string[],
  skillPaths: readonly (readonly string[])[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [agentPaths, ...skillPaths]) {
    for (const p of list) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** A document as read for a run; `text` is `null` when the file could not be read. */
export interface BudgetInput {
  path: string;
  text: string | null;
  /** True when the read stopped at the byte bound, so `text` is only a prefix. */
  cut?: boolean;
}

/**
 * Splits a bounded read: callers ask the source for `maxBytes + 1` bytes, so a
 * result longer than `maxBytes` bytes proves the file was cut. The extra byte
 * is dropped (it may be half a multi-byte character).
 */
export function boundRead(text: string | null, maxBytes: number): { text: string | null; cut: boolean } {
  if (text === null || Buffer.byteLength(text, 'utf8') <= maxBytes) return { text, cut: false };
  return { text: text.slice(0, -1), cut: true };
}

/** Marker for a document cut by the byte bound before it was tokenized. */
export function byteCutMarker(): string {
  return '[truncated: file exceeds the size limit]';
}

export interface BudgetedDoc {
  path: string;
  /** Text to inject; carries the truncation marker when cut. */
  content: string;
}

export interface BudgetResult {
  docs: BudgetedDoc[];
  entries: ProjectContextEntry[];
  /** Sum of injected content tokens (markers not counted). */
  tokens: number;
}

export type TruncateFn = (text: string, max: number) => { text: string; total: number };

export function truncationMarker(kept: number, total: number): string {
  return `[truncated: ${kept} of ${total} tokens]`;
}

/**
 * Applies the per-document and per-run token caps in run order (NFR-5/NFR-6).
 * Each doc is `included`, `truncated` (first N tokens + marker; N is the lesser
 * of the per-doc cap and what is left of the run cap), `dropped` (run cap
 * already spent — left out, its entry keeps the full token count) or `missing`
 * (unreadable — `tokens: null`). For `truncated`/`included` entries `tokens` is
 * what was injected.
 */
export function applyBudget(
  inputs: readonly BudgetInput[],
  truncate: TruncateFn,
  docCap = MAX_DOC_TOKENS,
  runCap = MAX_RUN_TOKENS,
): BudgetResult {
  const docs: BudgetedDoc[] = [];
  const entries: ProjectContextEntry[] = [];
  let used = 0;
  for (const input of inputs) {
    if (input.text === null) {
      entries.push({ path: input.path, tokens: null, status: 'missing' });
      continue;
    }
    const allowed = Math.min(docCap, runCap - used);
    if (allowed <= 0) {
      entries.push({ path: input.path, tokens: truncate(input.text, 0).total, status: 'dropped' });
      continue;
    }
    const cut = truncate(input.text, allowed);
    if (cut.total <= allowed && input.cut) {
      // Prefix fits the token cap but the file was cut by the byte bound.
      docs.push({ path: input.path, content: `${input.text}\n${byteCutMarker()}` });
      entries.push({ path: input.path, tokens: cut.total, status: 'truncated' });
      used += cut.total;
    } else if (cut.total <= allowed) {
      docs.push({ path: input.path, content: input.text });
      entries.push({ path: input.path, tokens: cut.total, status: 'included' });
      used += cut.total;
    } else {
      docs.push({ path: input.path, content: `${cut.text}\n${truncationMarker(allowed, cut.total)}` });
      entries.push({ path: input.path, tokens: allowed, status: 'truncated' });
      used += allowed;
    }
  }
  return { docs, entries, tokens: used };
}
