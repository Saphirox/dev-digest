import { describe, expect, it } from 'vitest';
import { Resolver } from '../src/modules/_shared/resolver.js';
import { RepoNotFound, PrNotFound, AgentNotFound, AgentAmbiguous } from '../src/platform/errors.js';
import { FakeLookupStore, fakeAgentRef } from './fakes.js';

describe('Resolver.resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    const store = new FakeLookupStore({ repos: [{ id: 'r1', full_name: 'Acme/Payments-Api' }] });
    const resolver = new Resolver(store);

    const result = await resolver.resolveRepo('acme/payments-api');
    expect(result).toEqual({ id: 'r1', full_name: 'Acme/Payments-Api' });
  });

  it('throws RepoNotFound with up to 10 known repos', async () => {
    const store = new FakeLookupStore({ repos: [{ id: 'r1', full_name: 'acme/payments-api' }] });
    const resolver = new Resolver(store);

    const err = await resolver.resolveRepo('acme/unknown').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RepoNotFound);
    expect((err as RepoNotFound).known).toEqual(['acme/payments-api']);
  });
});

describe('Resolver.resolvePr', () => {
  it('resolves a PR by number and caches the result', async () => {
    const store = new FakeLookupStore({ pulls: { r1: [{ id: 'p1', number: 42 }] } });
    const resolver = new Resolver(store);

    const first = await resolver.resolvePr('acme/payments-api', 'r1', 42);
    const second = await resolver.resolvePr('acme/payments-api', 'r1', 42);

    expect(first).toBe('p1');
    expect(second).toBe('p1');
    expect(store.calls.filter((c) => c.method === 'listPulls')).toHaveLength(1);
  });

  it('throws PrNotFound with recent PR numbers on a miss', async () => {
    const store = new FakeLookupStore({ pulls: { r1: [{ id: 'p1', number: 42 }] } });
    const resolver = new Resolver(store);

    const err = await resolver.resolvePr('acme/payments-api', 'r1', 99).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrNotFound);
    expect((err as PrNotFound).recent).toEqual([42]);
  });

  it('throws PrNotFound when the matching PR has a null id', async () => {
    const store = new FakeLookupStore({ pulls: { r1: [{ id: null, number: 42 }] } });
    const resolver = new Resolver(store);

    await expect(resolver.resolvePr('acme/payments-api', 'r1', 42)).rejects.toBeInstanceOf(
      PrNotFound,
    );
  });
});

describe('Resolver.invalidatePr', () => {
  it('evicts the cached id so the next resolvePr call re-fetches', async () => {
    const store = new FakeLookupStore({ pulls: { r1: [{ id: 'p1', number: 42 }] } });
    const resolver = new Resolver(store);

    await resolver.resolvePr('acme/payments-api', 'r1', 42);
    resolver.invalidatePr('acme/payments-api', 42);
    await resolver.resolvePr('acme/payments-api', 'r1', 42);

    expect(store.calls.filter((c) => c.method === 'listPulls')).toHaveLength(2);
  });

  it('is case-insensitive on repo, matching resolvePr\'s cache key', async () => {
    const store = new FakeLookupStore({ pulls: { r1: [{ id: 'p1', number: 42 }] } });
    const resolver = new Resolver(store);

    await resolver.resolvePr('Acme/Payments-Api', 'r1', 42);
    resolver.invalidatePr('acme/payments-api', 42);
    await resolver.resolvePr('Acme/Payments-Api', 'r1', 42);

    expect(store.calls.filter((c) => c.method === 'listPulls')).toHaveLength(2);
  });

  it('is a no-op for an id that was never cached', () => {
    const store = new FakeLookupStore();
    const resolver = new Resolver(store);

    expect(() => resolver.invalidatePr('acme/payments-api', 42)).not.toThrow();
  });
});

describe('Resolver.resolveAgent', () => {
  it('resolves by exact id', async () => {
    const store = new FakeLookupStore({ agents: [fakeAgentRef({ id: 'a1', name: 'Reviewer' })] });
    const resolver = new Resolver(store);

    const result = await resolver.resolveAgent('a1');
    expect(result.id).toBe('a1');
  });

  it('resolves by exact case-insensitive name', async () => {
    const store = new FakeLookupStore({ agents: [fakeAgentRef({ id: 'a1', name: 'Security Reviewer' })] });
    const resolver = new Resolver(store);

    const result = await resolver.resolveAgent('security reviewer');
    expect(result.id).toBe('a1');
  });

  it('resolves by a unique case-insensitive substring', async () => {
    const store = new FakeLookupStore({
      agents: [
        fakeAgentRef({ id: 'a1', name: 'Security Reviewer' }),
        fakeAgentRef({ id: 'a2', name: 'Perf Bot' }),
      ],
    });
    const resolver = new Resolver(store);

    const result = await resolver.resolveAgent('security');
    expect(result.id).toBe('a1');
  });

  it('throws AgentAmbiguous when the substring matches more than one agent', async () => {
    const store = new FakeLookupStore({
      agents: [
        fakeAgentRef({ id: 'a1', name: 'Security Reviewer' }),
        fakeAgentRef({ id: 'a2', name: 'Security Bot' }),
      ],
    });
    const resolver = new Resolver(store);

    const err = await resolver.resolveAgent('security').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentAmbiguous);
    expect((err as AgentAmbiguous).names.sort()).toEqual(['Security Bot', 'Security Reviewer']);
  });

  it('throws AgentNotFound when nothing matches', async () => {
    const store = new FakeLookupStore({ agents: [fakeAgentRef({ id: 'a1', name: 'Reviewer' })] });
    const resolver = new Resolver(store);

    await expect(resolver.resolveAgent('nope')).rejects.toBeInstanceOf(AgentNotFound);
  });
});
