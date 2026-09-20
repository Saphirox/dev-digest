/**
 * Deterministic scope filter — the two invariants come first: CRITICAL
 * findings are never dropped, and out-of-scope findings always collapse onto
 * exactly one carrier (never silently discarded in bulk).
 */
import { describe, it, expect } from 'vitest';
import { filterOutOfScope } from '../src/modules/reviews/scope-filter.js';
import type { Finding, PrIntentRecord } from '@devdigest/shared';

function finding(o: Partial<Finding> & { id: string }): Finding {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/api/users.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'Because.',
    suggestion: null,
    confidence: 0.8,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    ...o,
  };
}

function intent(o: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    pr_id: 'pr-1',
    intent: 'Adds a payments retry.',
    in_scope: ['payments retry'],
    out_of_scope: ['authentication'],
    confidence: 0.8,
    derived_for_sha: 'abc123',
    derived_at: '2026-09-20T00:00:00.000Z',
    stale: false,
    sources: [],
    missing_context: [],
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    ...o,
  };
}

describe('filterOutOfScope — CRITICAL is never dropped', () => {
  it('keeps a CRITICAL finding even when its file/title match out_of_scope', () => {
    const findings = [
      finding({ id: '1', severity: 'CRITICAL', title: 'Auth bypass', file: 'src/authentication/login.ts' }),
    ];
    const { kept, dropped, carrier } = filterOutOfScope(findings, intent());
    expect(kept).toEqual(findings);
    expect(dropped).toEqual([]);
    expect(carrier).toBeNull();
  });
});

describe('filterOutOfScope — collapses to exactly one carrier', () => {
  it('collapses 5 out-of-scope WARNINGs to 1 carrier that keeps its own file/start_line and names the other 4', () => {
    const findings = Array.from({ length: 5 }, (_, i) =>
      finding({
        id: String(i),
        severity: 'WARNING',
        title: `Auth issue ${i}`,
        file: `src/authentication/file${i}.ts`,
        start_line: 100 + i,
        confidence: 0.5 + i * 0.1, // last one (i=4) has the highest confidence
      }),
    );
    const { kept, dropped, carrier } = filterOutOfScope(findings, intent());

    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(4);
    expect(carrier).not.toBeNull();
    // Highest confidence among ties wins (all WARNING here).
    expect(carrier!.file).toBe('src/authentication/file4.ts');
    expect(carrier!.start_line).toBe(104);
    expect(carrier!.severity).toBe('WARNING');
    expect(carrier!.title).toContain('+4 more');
    expect(carrier!.rationale).toContain('Auth issue 0');
    expect(carrier!.rationale).toContain('Auth issue 3');
    expect(kept[0]).toBe(carrier);
  });

  it('kept.length + dropped.length === input.length, always', () => {
    const findings = [
      finding({ id: 'a', severity: 'CRITICAL', file: 'src/authentication/a.ts' }),
      finding({ id: 'b', severity: 'WARNING', file: 'src/authentication/b.ts' }),
      finding({ id: 'c', severity: 'SUGGESTION', file: 'src/authentication/c.ts' }),
      finding({ id: 'd', severity: 'WARNING', file: 'src/payments/d.ts' }), // in-scope
    ];
    const { kept, dropped } = filterOutOfScope(findings, intent());
    expect(kept.length + dropped.length).toBe(findings.length);
  });
});

describe('filterOutOfScope — identity paths', () => {
  it('is the identity when there is no intent', () => {
    const findings = [finding({ id: '1', file: 'src/authentication/x.ts' })];
    expect(filterOutOfScope(findings, null)).toEqual({ kept: findings, dropped: [], carrier: null });
    expect(filterOutOfScope(findings, undefined)).toEqual({ kept: findings, dropped: [], carrier: null });
  });

  it('is the identity when out_of_scope is empty', () => {
    const findings = [finding({ id: '1', file: 'src/authentication/x.ts' })];
    expect(filterOutOfScope(findings, intent({ out_of_scope: [] }))).toEqual({
      kept: findings,
      dropped: [],
      carrier: null,
    });
  });

  it('is the identity when nothing matches out_of_scope', () => {
    const findings = [finding({ id: '1', file: 'src/payments/x.ts', title: 'Retry bug' })];
    expect(filterOutOfScope(findings, intent())).toEqual({ kept: findings, dropped: [], carrier: null });
  });
});

describe('filterOutOfScope — matching rule', () => {
  it('matches a token by file path segment OR title word', () => {
    const byPath = finding({ id: 'p', file: 'src/authentication/session.ts', title: 'Session leak' });
    const byTitle = finding({ id: 't', file: 'src/other/place.ts', title: 'Authentication token leak' });
    const neither = finding({ id: 'n', file: 'src/payments/retry.ts', title: 'Retry loop bug' });

    const r1 = filterOutOfScope([byPath], intent());
    const r2 = filterOutOfScope([byTitle], intent());
    const r3 = filterOutOfScope([neither], intent());

    expect(r1.carrier).not.toBeNull();
    expect(r2.carrier).not.toBeNull();
    expect(r3.carrier).toBeNull();
  });

  it('does NOT drop findings that merely share a filler word with a scope entry', () => {
    // Regression: the scope wording is taken verbatim from a real PR brief.
    // "Logging / observability FOR the limiter" used to contribute the token
    // `for`, which matched every title containing the word "for" and dropped
    // unrelated WARNINGs.
    const screenshotScope = intent({
      out_of_scope: [
        'Authentication changes',
        'Adding new endpoints',
        'Logging / observability for the limiter',
      ],
    });
    const findings = [
      finding({ id: '1', title: 'Missing null check for admin route', file: 'src/api/admin.ts' }),
      finding({ id: '2', title: 'Unbounded retry loop for webhook delivery', file: 'src/jobs/webhook.ts' }),
      finding({ id: '3', title: 'Timeout not applied for outbound call', file: 'src/http/client.ts' }),
    ];

    const { kept, dropped, carrier } = filterOutOfScope(findings, screenshotScope);

    expect(dropped).toEqual([]);
    expect(carrier).toBeNull();
    expect(kept).toEqual(findings);
  });

  it('still drops a finding that genuinely matches two scope tokens in its title', () => {
    const twoTokens = intent({ out_of_scope: ['observability logging'] });
    const genuine = finding({ id: 'g', title: 'Logging misses observability context', file: 'src/x/y.ts' });
    const unrelated = finding({ id: 'u', title: 'Off-by-one in retry counter', file: 'src/x/z.ts' });

    const { kept, carrier } = filterOutOfScope([genuine, unrelated], twoTokens);

    expect(carrier?.title).toContain('Logging misses observability context');
    expect(kept.map((f) => f.title)).toContain('Off-by-one in retry counter');
  });

  it('matches a single-token scope entry on that one token alone', () => {
    const single = intent({ out_of_scope: ['authentication'] });
    const hit = finding({ id: 'h', title: 'Authentication token leak', file: 'src/other/place.ts' });

    expect(filterOutOfScope([hit], single).carrier).not.toBeNull();
  });
});
