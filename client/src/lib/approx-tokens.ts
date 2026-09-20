/**
 * Rough token estimate for editor hints. The client has no tokenizer, so it
 * uses the same chars/4 fallback as the server; the UI shows it with a `~`.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
