/**
 * IntentService — unit tests against fake ports (no DB, no LLM, no GitHub/git).
 * Core invariants: an unreachable link is recorded as `missing_context`, never
 * invented text; a classifier failure never throws out of `ensureFresh`; a
 * fresh stored record short-circuits the model call.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ChatMessage, IntentSource, PrIntentRecord, UnifiedDiff } from '@devdigest/shared';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger } from '../src/platform/run-logger.js';
import { IntentService, type IntentPull } from '../src/modules/reviews/intent/service.js';
import type { IntentModel, IntentSources, IntentStore, IntentUpsertInput } from '../src/modules/reviews/intent/ports.js';
import type { IntentClassification } from '../src/modules/reviews/intent/prompt.js';

function fakeLog(): RunLogger {
  return new RunLogger(new RunBus(), ['run-1']);
}

const PULL: IntentPull = {
  id: 'pr-1',
  number: 5,
  title: 'Add rate limiting',
  body: 'See docs/plans/0002-intent-layer.md for the spec.',
  headSha: 'sha-new',
};
const REPO = { owner: 'acme', name: 'app' };
const DIFF: UnifiedDiff = {
  raw: 'diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n context\n',
  files: [{ path: 'src/a.ts', additions: 1, deletions: 0, hunks: [] }],
};

function makeStore(initial?: PrIntentRecord): IntentStore & { current(): PrIntentRecord | undefined } {
  let stored: PrIntentRecord | undefined = initial;
  return {
    get: async () => stored,
    upsert: async (prId, record: IntentUpsertInput) => {
      stored = {
        pr_id: prId,
        intent: record.intent,
        in_scope: record.inScope,
        out_of_scope: record.outOfScope,
        derived_for_sha: record.derivedForSha,
        derived_at: new Date().toISOString(),
        stale: false,
        sources: record.sources,
        missing_context: record.missingContext,
        provider: record.provider,
        model: record.model,
      };
    },
    current: () => stored,
  };
}

const TOKENS = { count: (s: string) => s.length };

function classification(o: Partial<IntentClassification> = {}): IntentClassification {
  return {
    summary: 'The fake model summary.',
    in_scope: ['rate limiter'],
    out_of_scope: [],
    missing_context: [],
    ...o,
  };
}

describe('IntentService.derive — unreachable doc link', () => {
  it('records missing_context + an { ok: false } source, and persists the summary VERBATIM (no invented text)', async () => {
    const store = makeStore();
    const sources: IntentSources = {
      getIssue: async () => {
        throw new Error('no issue');
      },
      readFile: async () => {
        throw new Error('not found');
      },
    };
    const classifyCalls: ChatMessage[][] = [];
    const model: IntentModel = {
      classify: async (_ws, messages) => {
        classifyCalls.push(messages);
        return { data: classification(), model: 'deepseek/deepseek-v4-flash', provider: 'openrouter', costUsd: null };
      },
    };
    const service = new IntentService({ store, sources, model, tokens: TOKENS });

    const result = await service.derive('ws-1', PULL, REPO, DIFF, fakeLog());

    expect(result.intent.missing_context).toContain('docs/plans/0002-intent-layer.md');
    const docSource = result.intent.sources.find((s: IntentSource) => s.kind === 'repo_file');
    expect(docSource).toMatchObject({ ref: 'docs/plans/0002-intent-layer.md', ok: false });
    // The persisted intent text is the fake model's summary VERBATIM.
    expect(result.intent.intent).toBe('The fake model summary.');
    expect(store.current()?.intent).toBe('The fake model summary.');
    expect(classifyCalls).toHaveLength(1);
  });
});

describe('IntentService.ensureFresh — never throws', () => {
  it('a classifier throw resolves undefined instead of propagating', async () => {
    const store = makeStore();
    const sources: IntentSources = {
      getIssue: async () => {
        throw new Error('unused');
      },
      readFile: async () => {
        throw new Error('unused');
      },
    };
    const model: IntentModel = {
      classify: async () => {
        throw new Error('provider is down');
      },
    };
    const service = new IntentService({ store, sources, model, tokens: TOKENS });

    await expect(service.ensureFresh('ws-1', PULL, REPO, DIFF, fakeLog())).resolves.toBeUndefined();
  });

  it('a stored record fresh for the current head_sha makes ZERO model calls', async () => {
    const stored: PrIntentRecord = {
      pr_id: PULL.id,
      intent: 'Already derived.',
      in_scope: [],
      out_of_scope: [],
      derived_for_sha: PULL.headSha, // matches — fresh
      derived_at: '2026-09-20T00:00:00.000Z',
      stale: false,
      sources: [],
      missing_context: [],
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    };
    const store = makeStore(stored);
    const classify = vi.fn();
    const model: IntentModel = { classify };
    const sources: IntentSources = {
      getIssue: async () => {
        throw new Error('unused');
      },
      readFile: async () => {
        throw new Error('unused');
      },
    };
    const service = new IntentService({ store, sources, model, tokens: TOKENS });

    const result = await service.ensureFresh('ws-1', PULL, REPO, DIFF, fakeLog());

    expect(result?.intent).toBe('Already derived.');
    expect(result?.stale).toBe(false);
    expect(classify).not.toHaveBeenCalled();
  });
});

describe('IntentService.derive — reachable doc link', () => {
  it('appears in sources with ok:true and its text reaches the classifier messages', async () => {
    const store = makeStore();
    const sources: IntentSources = {
      getIssue: async () => {
        throw new Error('no issue');
      },
      readFile: async (_repo, path) => {
        expect(path).toBe('docs/plans/0002-intent-layer.md');
        return '# Intent Layer\nThe cheap classifier spec.';
      },
    };
    const classifyCalls: ChatMessage[][] = [];
    const model: IntentModel = {
      classify: async (_ws, messages) => {
        classifyCalls.push(messages);
        return { data: classification(), model: 'deepseek/deepseek-v4-flash', provider: 'openrouter', costUsd: 0.0004 };
      },
    };
    const service = new IntentService({ store, sources, model, tokens: TOKENS });

    const result = await service.derive('ws-1', PULL, REPO, DIFF, fakeLog());

    const docSource = result.intent.sources.find((s: IntentSource) => s.kind === 'repo_file');
    expect(docSource).toMatchObject({ ref: 'docs/plans/0002-intent-layer.md', ok: true, note: null });
    const joined = classifyCalls[0]!.map((m) => m.content).join('\n');
    expect(joined).toContain('The cheap classifier spec.');
    expect(result.intent.missing_context).toEqual([]);
  });
});
