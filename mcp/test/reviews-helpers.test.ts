import { describe, expect, it } from 'vitest';
import {
  buildFindingsPayload,
  counts,
  latestPerAgent,
  selectFindings,
  toFullItem,
  toSummaryItem,
  worstVerdict,
} from '../src/modules/reviews/helpers.js';
import type { FindingRecord, ReviewRecord } from '../src/modules/reviews/ports.js';
import { renderFindingLine } from '../src/modules/reviews/render.js';
import { FULL_LIMIT_MAX } from '../src/modules/reviews/constants.js';

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

describe('selectFindings', () => {
  it('drops dismissed findings', () => {
    const kept = selectFindings([finding({ title: 'a' }), finding({ title: 'b', dismissed_at: '2026-01-01' })]);
    expect(kept.map((f) => f.title)).toEqual(['a']);
  });

  it('filters by minSeverity', () => {
    const findings = [
      finding({ title: 'crit', severity: 'CRITICAL' }),
      finding({ title: 'warn', severity: 'WARNING' }),
      finding({ title: 'sugg', severity: 'SUGGESTION' }),
    ];
    const kept = selectFindings(findings, { minSeverity: 'WARNING' });
    expect(kept.map((f) => f.title).sort()).toEqual(['crit', 'warn']);
  });

  it('sorts CRITICAL > WARNING > SUGGESTION, then file, then line', () => {
    const findings = [
      finding({ title: '1', severity: 'SUGGESTION', file: 'b.ts', start_line: 1 }),
      finding({ title: '2', severity: 'CRITICAL', file: 'z.ts', start_line: 5 }),
      finding({ title: '3', severity: 'CRITICAL', file: 'a.ts', start_line: 9 }),
      finding({ title: '4', severity: 'WARNING', file: 'a.ts', start_line: 1 }),
    ];
    const kept = selectFindings(findings);
    expect(kept.map((f) => f.title)).toEqual(['3', '2', '4', '1']);
  });

  it('slices to limit', () => {
    const findings = Array.from({ length: 5 }, (_, i) => finding({ title: String(i) }));
    expect(selectFindings(findings, { limit: 2 })).toHaveLength(2);
  });
});

describe('counts', () => {
  it('counts per severity, excluding dismissed', () => {
    const result = counts([
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'CRITICAL', dismissed_at: '2026-01-01' }),
      finding({ severity: 'WARNING' }),
      finding({ severity: 'SUGGESTION' }),
      finding({ severity: 'SUGGESTION' }),
    ]);
    expect(result).toEqual({ critical: 1, warning: 1, suggestion: 2 });
  });
});

describe('worstVerdict', () => {
  it('picks request_changes over comment and approve', () => {
    expect(
      worstVerdict([{ verdict: 'approve' }, { verdict: 'request_changes' }, { verdict: 'comment' }]),
    ).toBe('request_changes');
  });

  it('returns null when every verdict is null', () => {
    expect(worstVerdict([{ verdict: null }, { verdict: null }])).toBeNull();
  });
});

describe('latestPerAgent', () => {
  function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
    return {
      id: 'r1',
      agent_id: 'a1',
      agent_name: 'Reviewer',
      run_id: 'run1',
      verdict: 'approve',
      score: 90,
      created_at: '2026-01-01T00:00:00Z',
      findings: [],
      ...overrides,
    };
  }

  it('keeps only the latest review per agent_id', () => {
    const reviews = [
      review({ id: 'old', agent_id: 'a1', created_at: '2026-01-01T00:00:00Z' }),
      review({ id: 'new', agent_id: 'a1', created_at: '2026-02-01T00:00:00Z' }),
      review({ id: 'other-agent', agent_id: 'a2', created_at: '2026-01-15T00:00:00Z' }),
    ];
    const result = latestPerAgent(reviews);
    expect(result.map((r) => r.id).sort()).toEqual(['new', 'other-agent']);
  });
});

describe('toSummaryItem / toFullItem', () => {
  it('lowercases severity and truncates rationale/suggestion in the full item', () => {
    const f = finding({ rationale: 'x'.repeat(1000), suggestion: 'y'.repeat(1000) });
    const summary = toSummaryItem(f);
    const full = toFullItem(f);

    expect(summary.severity).toBe('warning');
    expect(full.rationale.length).toBeLessThanOrEqual(800);
    expect(full.suggestion?.length).toBeLessThanOrEqual(600);
  });

  it('includes the agent name only when passed', () => {
    expect(toSummaryItem(finding()).agent).toBeUndefined();
    expect(toSummaryItem(finding(), 'Reviewer').agent).toBe('Reviewer');
  });
});

describe('buildFindingsPayload', () => {
  function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
    return {
      id: 'r1',
      agent_id: 'a1',
      agent_name: 'Reviewer',
      run_id: 'run1',
      verdict: 'approve',
      score: 90,
      created_at: '2026-01-01T00:00:00Z',
      findings: [],
      ...overrides,
    };
  }

  it('tags each finding with its own review\'s agent name, across multiple reviews', () => {
    const reviews = [
      review({ agent_name: 'Reviewer', findings: [finding({ title: 'from-reviewer', severity: 'CRITICAL' })] }),
      review({ agent_name: 'Security Bot', findings: [finding({ title: 'from-security', severity: 'WARNING' })] }),
    ];
    const payload = buildFindingsPayload(reviews, { limit: 20, detail: 'summary' });

    const byTitle = Object.fromEntries(payload.findings.map((f) => [f.title, f.agent]));
    expect(byTitle).toEqual({ 'from-reviewer': 'Reviewer', 'from-security': 'Security Bot' });
  });

  it('excludes dismissed findings from both the returned list and counts', () => {
    const reviews = [
      review({
        findings: [
          finding({ title: 'kept', dismissed_at: null }),
          finding({ title: 'dismissed', dismissed_at: '2026-01-02T00:00:00Z' }),
        ],
      }),
    ];
    const payload = buildFindingsPayload(reviews, { limit: 20, detail: 'summary' });

    expect(payload.findings.map((f) => f.title)).toEqual(['kept']);
    expect(payload.counts).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });

  it('applies minSeverity across the merged, multi-review finding list', () => {
    const reviews = [
      review({ findings: [finding({ title: 'crit', severity: 'CRITICAL' })] }),
      review({ findings: [finding({ title: 'sugg', severity: 'SUGGESTION' })] }),
    ];
    const payload = buildFindingsPayload(reviews, { minSeverity: 'WARNING', limit: 20, detail: 'summary' });

    expect(payload.findings.map((f) => f.title)).toEqual(['crit']);
  });

  it('reports the correct "more" count when the merged list exceeds limit', () => {
    const reviews = [
      review({
        findings: Array.from({ length: 5 }, (_, i) => finding({ title: String(i) })),
      }),
    ];
    const payload = buildFindingsPayload(reviews, { limit: 3, detail: 'summary' });

    expect(payload.findings).toHaveLength(3);
    expect(payload.more).toBe(2);
  });

  it('picks the worst verdict across every review, independent of the findings limit', () => {
    const reviews = [
      review({ verdict: 'approve', findings: [] }),
      review({ verdict: 'request_changes', findings: [] }),
    ];
    const payload = buildFindingsPayload(reviews, { limit: 20, detail: 'summary' });

    expect(payload.verdict).toBe('request_changes');
  });
});

describe('Token budget (plan "Token budget")', () => {
  it('a 20-item summary findings result stays <= 8,000 chars', () => {
    const findings = Array.from({ length: 20 }, (_, i) =>
      finding({
        file: `src/module-${i}/very-long-descriptive-file-name-here.ts`,
        title: 'A moderately long finding title describing the issue in one line',
      }),
    );
    const items = selectFindings(findings, { limit: 20 }).map((f) => toSummaryItem(f, 'Reviewer'));
    const size = JSON.stringify({ findings: items }).length;
    expect(size).toBeLessThanOrEqual(8_000);
  });

  it(
    'an ALL-MAX get_findings(detail:"full") fixture at FULL_LIMIT_MAX renders <= 40,000 chars ' +
      '(text + structuredContent); one finding more does not',
    () => {
      // Every field at its max simultaneously (not a mixed "realistic
      // distribution" — that undersold the true worst case). file/title/
      // category/agent have no server-enforced length cap (`findings.file`/
      // `.title`/`.category` are plain Postgres `text`), so their "max" here
      // is a grounded, generous judgment call, not a real constraint:
      // FILE_MAX is empirically the longest actual file path in this very
      // repo (126 chars via `git ls-files | awk '{print length}' | sort -rn
      // | head -1`, rounded up); TITLE_MAX/CATEGORY_MAX/AGENT_MAX are round
      // numbers for a one-line title, a short enum-like category, and a long
      // custom agent name. rationale/suggestion use the real ≤800/≤600 caps
      // (`RATIONALE_MAX`/`SUGGESTION_MAX` in `helpers.ts`). `FULL_LIMIT_MAX`
      // (`constants.ts`) is this exact computed boundary — keep the two in
      // sync if either changes.
      const FILE_MAX = 130;
      const TITLE_MAX = 100;
      const CATEGORY_MAX = 20;
      const AGENT_MAX = 40;

      function allMaxFinding(): FindingRecord {
        return finding({
          file: 'f'.repeat(FILE_MAX),
          title: 't'.repeat(TITLE_MAX),
          category: 'c'.repeat(CATEGORY_MAX),
          rationale: 'r'.repeat(900), // > 800: exercises the truncation cap
          suggestion: 's'.repeat(700), // > 600: exercises the truncation cap
        });
      }

      // Mirrors the real `get_findings` tool's 'done' response shape
      // (`modules/reviews/tools.ts`): structuredContent + one rendered text
      // line per finding, not just the bare `findings` array.
      function toolShapedSize(limit: number): number {
        const items = Array.from({ length: limit }, () => allMaxFinding()).map((f) =>
          toFullItem(f, 'a'.repeat(AGENT_MAX)),
        );
        const structuredContent = {
          status: 'done',
          pr: 'acme/very-long-example-repo-name#123456',
          verdict: 'request_changes',
          reviews: [
            { agent: 'a'.repeat(AGENT_MAX), run_id: 'r'.repeat(36), verdict: 'request_changes', score: 42 },
          ],
          counts: { critical: limit, warning: 0, suggestion: 0 },
          findings: items,
          more: 0,
        };
        const lines = [
          'DONE acme/very-long-example-repo-name#123456 verdict=request_changes',
          ...items.map((item) => renderFindingLine(item)),
        ];
        return JSON.stringify(structuredContent).length + lines.join('\n').length;
      }

      // The truncation caps actually fired.
      const [sample] = Array.from({ length: 1 }, () => allMaxFinding()).map((f) =>
        toFullItem(f, 'a'.repeat(AGENT_MAX)),
      );
      expect(sample!.rationale.length).toBe(800);
      expect(sample!.suggestion?.length).toBe(600);

      expect(toolShapedSize(FULL_LIMIT_MAX)).toBeLessThanOrEqual(40_000);
      expect(toolShapedSize(FULL_LIMIT_MAX + 1)).toBeGreaterThan(40_000);
    },
  );
});
