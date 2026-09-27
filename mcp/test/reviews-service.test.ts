import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewsService } from '../src/modules/reviews/service.js';
import { Resolver } from '../src/modules/_shared/resolver.js';
import { RunFailed, RateLimited, NoRunStarted, ApiFailure, RunNotFound } from '../src/platform/errors.js';
import { FULL_LIMIT_MAX, MAX_LIMIT } from '../src/modules/reviews/constants.js';
import type { FindingRecord } from '../src/modules/reviews/ports.js';
import { FakeLookupStore, ScriptedReviewsStore, fakeReview } from './fakes.js';

const REPO = { id: 'repo1', full_name: 'acme/payments-api' };
const PR = { id: 'pr1', number: 42 };
const AGENT = { id: 'agent1', name: 'Reviewer' };

function makeLookup(): FakeLookupStore {
  return new FakeLookupStore({ repos: [REPO], pulls: { repo1: [PR] }, agents: [AGENT] });
}

/** Drains fake timers/microtasks until `promise` settles or `maxTicks` is hit. */
async function drain<T>(promise: Promise<T>, pollMs: number, maxTicks = 50): Promise<T> {
  let settled = false;
  let value!: T;
  let error: unknown;
  promise.then(
    (v) => {
      settled = true;
      value = v;
    },
    (e) => {
      settled = true;
      error = e;
    },
  );
  for (let i = 0; i < maxTicks && !settled; i++) {
    await vi.advanceTimersByTimeAsync(pollMs);
  }
  if (error) throw error;
  return value;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReviewsService.runAgentOnPr', () => {
  it('resolves status "done" with verdict/counts/findings once the run completes', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'done', error: null }],
      listReviews: () => [fakeReview({ findings: [] })],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );
    const result = await drain(promise, 3_000);

    expect(result).toEqual({
      status: 'done',
      pr: 'acme/payments-api#42',
      agent: 'Reviewer',
      run_id: 'run1',
      verdict: 'approve',
      score: 92,
      counts: { critical: 0, warning: 0, suggestion: 0 },
      findings: [],
      more: 0,
    });
  });

  it('throws NoRunStarted (no prose) when the API returns zero runs', async () => {
    const store = new ScriptedReviewsStore({ startReviewResult: [] });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );

    const err = await drain(promise, 3_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoRunStarted);
    expect((err as NoRunStarted).prId).toBe('pr1');
  });

  it('throws RunFailed when the run fails', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'failed', error: 'provider key missing' }],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );

    await expect(drain(promise, 3_000)).rejects.toBeInstanceOf(RunFailed);
  });

  it('throws RunFailed when the run is cancelled', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'cancelled', error: null }],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );

    const err = await drain(promise, 3_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunFailed);
    expect((err as RunFailed).status).toBe('cancelled');
  });

  it('returns status "running" + run_id when the wait budget runs out', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'running', error: null }],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );
    const result = await drain(promise, 3_000);

    expect(result).toEqual({ status: 'running', pr: 'acme/payments-api#42', agent: 'Reviewer', run_id: 'run1' });
  });

  it('calls onProgress once per poll with increasing elapsed seconds', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'running', error: null }],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });
    const onProgress = vi.fn();

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000, onProgress },
    );
    await drain(promise, 3_000);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 3, 9);
    expect(onProgress).toHaveBeenNthCalledWith(2, 6, 9);
    expect(onProgress).toHaveBeenNthCalledWith(3, 9, 9);
  });

  it('stops quietly on abort without cancelling the run', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'running', error: null }],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });
    const controller = new AbortController();

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 30_000, pollMs: 3_000, signal: controller.signal },
    );

    await vi.advanceTimersByTimeAsync(3_000);
    controller.abort();
    const result = await drain(promise, 3_000);

    expect(result).toEqual({ status: 'running', pr: 'acme/payments-api#42', agent: 'Reviewer', run_id: 'run1' });
    // No cancel call exists on the port at all — aborting can only stop OUR wait.
    expect(store.runsCallCount).toBeLessThan(9);
  });

  it('doubles the poll interval once on a 429, then keeps going', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: (call) => {
        if (call === 0) return new RateLimited();
        return [{ run_id: 'run1', status: 'done', error: null }];
      },
      listReviews: () => [fakeReview()],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 30_000, pollMs: 3_000 },
    );
    const result = await drain(promise, 3_000, 20);

    expect(result.status).toBe('done');
    // First poll at t=3s throws 429 → interval doubles to 6s → next poll at t=9s.
    expect(store.runsCalls[1]! - store.runsCalls[0]!).toBe(6_000);
  });

  it('evicts the cached PR id on a 404 from startReview, so a retry re-resolves it', async () => {
    const store = new ScriptedReviewsStore({
      startReviewError: (call) => (call === 0 ? new ApiFailure(404, 'Pull request not found') : undefined),
    });
    const lookup = makeLookup();
    const resolver = new Resolver(lookup);
    const service = new ReviewsService({ store, resolver });

    const failed = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );
    await expect(drain(failed, 3_000)).rejects.toBeInstanceOf(ApiFailure);
    expect(lookup.calls.filter((c) => c.method === 'listPulls')).toHaveLength(1);

    const retried = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );
    const result = await drain(retried, 3_000);

    expect(result.status).toBe('running');
    // The cache was evicted after the 404 — the retry re-fetches instead of
    // reusing the stale id.
    expect(lookup.calls.filter((c) => c.method === 'listPulls')).toHaveLength(2);
  });

  it('re-polls listReviews once when the review is briefly absent after done', async () => {
    const store = new ScriptedReviewsStore({
      listRuns: () => [{ run_id: 'run1', status: 'done', error: null }],
      listReviews: (call) => (call === 0 ? [] : [fakeReview()]),
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const promise = service.runAgentOnPr(
      { repo: 'acme/payments-api', pr: 42, agent: 'Reviewer' },
      { waitMs: 9_000, pollMs: 3_000 },
    );
    const result = await drain(promise, 3_000);

    expect(result.status).toBe('done');
    expect(store.reviewsCallCount).toBe(2);
  });
});

describe('ReviewsService.getFindings', () => {
  it('returns status "none" when there are no reviews and no active runs', async () => {
    const store = new ScriptedReviewsStore({ listReviews: () => [], listActiveRuns: () => [] });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const result = await service.getFindings({ repo: 'acme/payments-api', pr: 42 });
    expect(result).toEqual({ status: 'none', pr: 'acme/payments-api#42' });
  });

  it('returns status "running" with running_run_ids when a run is active and no review exists yet', async () => {
    const store = new ScriptedReviewsStore({
      listReviews: () => [],
      listActiveRuns: () => [{ run_id: 'run1', status: 'running', error: null }],
    });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const result = await service.getFindings({ repo: 'acme/payments-api', pr: 42 });
    expect(result).toEqual({ status: 'running', pr: 'acme/payments-api#42', running_run_ids: ['run1'] });
  });

  it('returns status "done" with the latest review per agent when reviews exist', async () => {
    const store = new ScriptedReviewsStore({ listReviews: () => [fakeReview()] });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const result = await service.getFindings({ repo: 'acme/payments-api', pr: 42 });
    expect(result.status).toBe('done');
  });

  it('throws RunNotFound when run_id names an unknown run', async () => {
    const store = new ScriptedReviewsStore({ listReviews: () => [], listRuns: () => [] });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    await expect(service.getFindings({ repo: 'acme/payments-api', pr: 42, runId: 'nope' })).rejects.toBeInstanceOf(
      RunNotFound,
    );
  });

  it('evicts the cached PR id on a 404 from listReviews, so a retry re-resolves it', async () => {
    const store = new ScriptedReviewsStore({
      listReviews: () => {
        throw new ApiFailure(404, 'Pull request not found');
      },
    });
    const lookup = makeLookup();
    const service = new ReviewsService({ store, resolver: new Resolver(lookup) });

    await expect(service.getFindings({ repo: 'acme/payments-api', pr: 42 })).rejects.toBeInstanceOf(ApiFailure);
    expect(lookup.calls.filter((c) => c.method === 'listPulls')).toHaveLength(1);

    await expect(service.getFindings({ repo: 'acme/payments-api', pr: 42 })).rejects.toBeInstanceOf(ApiFailure);
    expect(lookup.calls.filter((c) => c.method === 'listPulls')).toHaveLength(2);
  });

  function bulkFinding(i: number): FindingRecord {
    return {
      severity: 'WARNING',
      category: 'bug',
      title: `finding ${i}`,
      file: 'src/index.ts',
      start_line: i,
      end_line: i,
      rationale: 'because reasons',
      suggestion: null,
      dismissed_at: null,
    };
  }

  it('caps detail:"full" at FULL_LIMIT_MAX even when limit asks for the raw 50-item ceiling', async () => {
    const findings = Array.from({ length: MAX_LIMIT }, (_, i) => bulkFinding(i));
    const store = new ScriptedReviewsStore({ listReviews: () => [fakeReview({ findings })] });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const result = await service.getFindings({ repo: 'acme/payments-api', pr: 42, detail: 'full', limit: MAX_LIMIT });

    expect(result.status).toBe('done');
    if (result.status === 'done') {
      expect(result.findings).toHaveLength(FULL_LIMIT_MAX);
      expect(result.more).toBe(MAX_LIMIT - FULL_LIMIT_MAX);
    }
  });

  it('does not cap detail:"summary" below MAX_LIMIT for the same limit:50 request', async () => {
    const findings = Array.from({ length: MAX_LIMIT }, (_, i) => bulkFinding(i));
    const store = new ScriptedReviewsStore({ listReviews: () => [fakeReview({ findings })] });
    const service = new ReviewsService({ store, resolver: new Resolver(makeLookup()) });

    const result = await service.getFindings({
      repo: 'acme/payments-api',
      pr: 42,
      detail: 'summary',
      limit: MAX_LIMIT,
    });

    expect(result.status).toBe('done');
    if (result.status === 'done') {
      expect(result.findings).toHaveLength(MAX_LIMIT);
      expect(result.more).toBe(0);
    }
  });
});
