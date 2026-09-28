import { describe, expect, it } from 'vitest';
import { renderFindingLine } from '../src/modules/reviews/render.js';
import { toSummaryItem } from '../src/modules/reviews/helpers.js';
import type { FindingRecord } from '../src/modules/reviews/ports.js';

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 'Something is off',
    file: 'src/index.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'because reasons',
    suggestion: 'fix it',
    dismissed_at: null,
    ...overrides,
  };
}

describe('renderFindingLine', () => {
  it('renders one line per finding', () => {
    const line = renderFindingLine(toSummaryItem(finding({ severity: 'CRITICAL', title: 'SQLi' })));
    expect(line).toBe('CRITICAL src/index.ts:10 SQLi');
  });

  it('appends the agent name in parens when present', () => {
    const line = renderFindingLine(toSummaryItem(finding(), 'Reviewer'));
    expect(line).toContain('(Reviewer)');
  });
});
