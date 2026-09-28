import { describe, expect, it } from 'vitest';
import { selectConventions, toConventionItem } from '../src/modules/conventions/helpers.js';
import type { ConventionRecord } from '../src/modules/conventions/ports.js';

function convention(overrides: Partial<ConventionRecord> = {}): ConventionRecord {
  return {
    rule: 'rule',
    category: 'general',
    evidence_path: 'a.ts',
    evidence_line: null,
    status: 'pending',
    ...overrides,
  };
}

describe('selectConventions', () => {
  it('lists accepted first, then the rest, capped at 50', () => {
    const conventions = [
      convention({ rule: 'p1', status: 'pending' }),
      convention({ rule: 'a1', status: 'accepted' }),
      convention({ rule: 'r1', status: 'rejected' }),
      convention({ rule: 'a2', status: 'accepted' }),
    ];
    const result = selectConventions(conventions);
    expect(result.map((c) => c.rule)).toEqual(['a1', 'a2', 'p1', 'r1']);
  });

  it('caps at the given limit', () => {
    const conventions = Array.from({ length: 60 }, (_, i) => convention({ rule: String(i) }));
    expect(selectConventions(conventions, 50)).toHaveLength(50);
  });
});

describe('toConventionItem', () => {
  it('combines evidence_path/evidence_line into path:line', () => {
    expect(toConventionItem(convention({ evidence_path: 'a.ts', evidence_line: 12 })).evidence).toBe('a.ts:12');
  });

  it('falls back to just the path when no line is known', () => {
    expect(toConventionItem(convention({ evidence_path: 'a.ts', evidence_line: null })).evidence).toBe('a.ts');
  });
});
