/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process, ONLY under modules/repo-intel. Swappable in tests via a
 * mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
  /**
   * First `max` tokens of `text` plus the full token count. `text` comes back
   * untouched when `total <= max`. Same fallback heuristic as `count`.
   */
  truncate(text: string, max: number): { text: string; total: number };
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      return this.enc.encode(text).length;
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }

  truncate(text: string, max: number): { text: string; total: number } {
    const limit = Math.max(0, Math.floor(max));
    if (!this.broken) {
      try {
        this.enc ??= getEncoding('cl100k_base');
        const ids = this.enc.encode(text);
        if (ids.length <= limit) return { text, total: ids.length };
        return { text: this.enc.decode(ids.slice(0, limit)), total: ids.length };
      } catch {
        this.broken = true;
      }
    }
    const total = approxTokens(text);
    return total <= limit ? { text, total } : { text: text.slice(0, limit * 4), total };
  }
}
