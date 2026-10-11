/**
 * Every module's `repository.ts` — response zod schemas + `safeParse` over a
 * stubbed HTTP client (no real `fetch`; transport concerns are `client.test.ts`'s
 * job). Each repository builds its own path (percent-encoding ids) and throws
 * `MalformedResponse` when the body doesn't match its local schema.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DevDigestApiClient } from '../src/adapters/devdigest-api/client.js';
import { MalformedResponse } from '../src/platform/errors.js';
import { LookupApiRepository } from '../src/modules/_shared/repository.js';
import { AgentsApiRepository } from '../src/modules/agents/repository.js';
import { ReviewsApiRepository } from '../src/modules/reviews/repository.js';
import { ConventionsApiRepository } from '../src/modules/conventions/repository.js';
import { BlastApiRepository } from '../src/modules/blast/repository.js';

class FakeClient {
  get = vi.fn();
  post = vi.fn();
}

function client(fake: FakeClient): DevDigestApiClient {
  return fake as unknown as DevDigestApiClient;
}

describe('LookupApiRepository', () => {
  it('listRepos parses id + full_name', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([{ id: 'r1', full_name: 'acme/payments-api' }]);
    const repo = new LookupApiRepository(client(fake));

    await expect(repo.listRepos()).resolves.toEqual([{ id: 'r1', full_name: 'acme/payments-api' }]);
    expect(fake.get).toHaveBeenCalledWith('/repos');
  });

  it('listPulls percent-encodes the repoId path segment', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([{ id: 'p1', number: 42 }]);
    const repo = new LookupApiRepository(client(fake));

    await repo.listPulls('repo id/with slash');
    expect(fake.get).toHaveBeenCalledWith(`/repos/${encodeURIComponent('repo id/with slash')}/pulls`);
  });

  it('listAgents requires only id + name (extra fields pass through, unused)', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([{ id: 'a1', name: 'Reviewer', description: 'ignored by this repo' }]);
    const repo = new LookupApiRepository(client(fake));

    const result = await repo.listAgents();
    expect(result).toEqual([expect.objectContaining({ id: 'a1', name: 'Reviewer' })]);
  });

  it('rejects with MalformedResponse(endpoint) when the body fails the local schema', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([{ id: 'r1' /* missing full_name */ }]);
    const repo = new LookupApiRepository(client(fake));

    const err = await repo.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalformedResponse);
    expect((err as MalformedResponse).endpoint).toBe('GET /repos');
  });
});

describe('AgentsApiRepository', () => {
  it('listAgents parses the full agent shape', async () => {
    const agents = [
      { id: 'a1', name: 'Reviewer', description: 'desc', provider: 'openai', model: 'gpt', enabled: true },
    ];
    const fake = new FakeClient();
    fake.get.mockResolvedValue(agents);
    const repo = new AgentsApiRepository(client(fake));

    await expect(repo.listAgents()).resolves.toEqual(agents);
    expect(fake.get).toHaveBeenCalledWith('/agents');
  });

  it('rejects with MalformedResponse(endpoint) on a bad shape', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([{ id: 'a1' /* missing fields */ }]);
    const repo = new AgentsApiRepository(client(fake));

    const err = await repo.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalformedResponse);
    expect((err as MalformedResponse).endpoint).toBe('GET /agents');
  });
});

describe('ReviewsApiRepository', () => {
  it('startReview POSTs {agentIds:[agentId]} to the percent-encoded prId path and returns runs', async () => {
    const runs = [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Reviewer' }];
    const fake = new FakeClient();
    fake.post.mockResolvedValue({ runs });
    const repo = new ReviewsApiRepository(client(fake));

    await expect(repo.startReview('p1/with slash', 'a1')).resolves.toEqual(runs);
    expect(fake.post).toHaveBeenCalledWith(
      `/pulls/${encodeURIComponent('p1/with slash')}/review`,
      { agentIds: ['a1'] },
    );
  });

  it('listRuns/listActiveRuns/listReviews percent-encode the prId path segment', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([]);
    const repo = new ReviewsApiRepository(client(fake));

    await repo.listRuns('p1/x');
    await repo.listActiveRuns('p1/x');
    await repo.listReviews('p1/x');

    const enc = encodeURIComponent('p1/x');
    expect(fake.get).toHaveBeenNthCalledWith(1, `/pulls/${enc}/runs`);
    expect(fake.get).toHaveBeenNthCalledWith(2, `/pulls/${enc}/runs/active`);
    expect(fake.get).toHaveBeenNthCalledWith(3, `/pulls/${enc}/reviews`);
  });

  it('rejects with MalformedResponse(endpoint) when a review fails the local schema', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue([{ id: 'r1' /* missing fields */ }]);
    const repo = new ReviewsApiRepository(client(fake));

    const err = await repo.listReviews('p1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalformedResponse);
    expect((err as MalformedResponse).endpoint).toBe('GET /pulls/:id/reviews');
  });
});

describe('ConventionsApiRepository', () => {
  it('listConventions parses conventions/sampled_files/last_scan_at, percent-encoding repoId', async () => {
    const list = { conventions: [], sampled_files: 3, last_scan_at: '2026-09-01T00:00:00Z' };
    const fake = new FakeClient();
    fake.get.mockResolvedValue(list);
    const repo = new ConventionsApiRepository(client(fake));

    await expect(repo.listConventions('repo id/x')).resolves.toEqual(list);
    expect(fake.get).toHaveBeenCalledWith(`/repos/${encodeURIComponent('repo id/x')}/conventions`);
  });

  it('rejects with MalformedResponse(endpoint) on a bad shape', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue({ conventions: 'not-an-array' });
    const repo = new ConventionsApiRepository(client(fake));

    const err = await repo.listConventions('r1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalformedResponse);
    expect((err as MalformedResponse).endpoint).toBe('GET /repos/:id/conventions');
  });
});

describe('BlastApiRepository', () => {
  it('getBlastRadius parses the blast radius shape, percent-encoding prId', async () => {
    const blast = {
      changed_symbols: [{ name: 'processPayment', file: 'src/payments.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'processPayment',
          file: 'src/payments.ts',
          callers: [{ name: 'handleCheckout', file: 'src/checkout.ts', line: 42 }],
          endpoints_affected: ['POST /checkout'],
          crons_affected: [],
        },
      ],
      summary: null,
      degraded: true,
      reason: 'index_partial',
      indexed_sha: 'abc123',
    };
    const fake = new FakeClient();
    fake.get.mockResolvedValue(blast);
    const repo = new BlastApiRepository(client(fake));

    await expect(repo.getBlastRadius('pr id/with slash')).resolves.toEqual(blast);
    expect(fake.get).toHaveBeenCalledWith(`/pulls/${encodeURIComponent('pr id/with slash')}/blast`);
  });

  it('rejects with MalformedResponse(endpoint) when a downstream entry fails the local schema', async () => {
    const fake = new FakeClient();
    fake.get.mockResolvedValue({
      changed_symbols: [],
      downstream: [{ symbol: 'x' /* missing callers/endpoints_affected/crons_affected */ }],
      summary: null,
    });
    const repo = new BlastApiRepository(client(fake));

    const err = await repo.getBlastRadius('p1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalformedResponse);
    expect((err as MalformedResponse).endpoint).toBe('GET /pulls/:id/blast');
  });
});
