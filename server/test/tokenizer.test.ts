import { describe, it, expect } from 'vitest';
import { TiktokenTokenizer, approxTokens } from '../src/adapters/tokenizer/index.js';

describe('TiktokenTokenizer.truncate', () => {
  const tok = new TiktokenTokenizer();
  const text = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');

  it('NFR-5: returns the text untouched when it fits', () => {
    const total = tok.count(text);
    expect(tok.truncate(text, total)).toEqual({ text, total });
    expect(tok.truncate(text, total + 100)).toEqual({ text, total });
  });

  it('NFR-5: keeps exactly the first N tokens and reports the full total', () => {
    const total = tok.count(text);
    const out = tok.truncate(text, 50);
    expect(out.total).toBe(total);
    expect(tok.count(out.text)).toBeLessThanOrEqual(50);
    expect(text.startsWith(out.text)).toBe(true);
    expect(out.text.length).toBeLessThan(text.length);
  });

  it('NFR-4: a zero budget keeps nothing', () => {
    expect(tok.truncate(text, 0).text).toBe('');
  });

  it('NFR-4: falls back to the chars/4 heuristic when the encoder is broken', () => {
    const broken = new TiktokenTokenizer() as unknown as { broken: boolean } & TiktokenTokenizer;
    broken.broken = true;
    const t = 'x'.repeat(100);
    expect(broken.truncate(t, 10)).toEqual({ text: 'x'.repeat(40), total: approxTokens(t) });
    expect(broken.truncate(t, 100)).toEqual({ text: t, total: 25 });
    expect(broken.count(t)).toBe(25);
  });
});
