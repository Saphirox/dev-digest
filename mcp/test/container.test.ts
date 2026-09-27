/**
 * `platform/container.ts`'s `Container` — the composition root for
 * cross-cutting infra only (HTTP client + shared `Resolver`). Every module's
 * own repository/service is built by that module's `tools.ts`, not tested
 * here (see `tools.test.ts`). This file covers the default wiring and every
 * `ContainerOverrides` field.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from '../src/platform/container.js';
import { DevDigestApiClient } from '../src/adapters/devdigest-api/client.js';
import { Resolver } from '../src/modules/_shared/resolver.js';
import { FakeLookupStore } from './fakes.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const CONFIG = { apiUrl: 'http://localhost:3001', waitMs: 42_000 };

describe('Container — default wiring', () => {
  it('constructs a real DevDigestApiClient and Resolver when no overrides are given', () => {
    const container = new Container(CONFIG);
    expect(container.client).toBeInstanceOf(DevDigestApiClient);
    expect(container.resolver).toBeInstanceOf(Resolver);
  });

  it('carries waitMs from config and leaves pollMs undefined', () => {
    const container = new Container(CONFIG);
    expect(container.waitMs).toBe(42_000);
    expect(container.pollMs).toBeUndefined();
  });
});

describe('Container — ContainerOverrides', () => {
  it('uses the overridden client verbatim instead of constructing one', () => {
    const fakeClient = new DevDigestApiClient('http://fake');
    const container = new Container(CONFIG, { client: fakeClient });
    expect(container.client).toBe(fakeClient);
  });

  it('uses the overridden resolver verbatim instead of constructing one', () => {
    const fakeResolver = new Resolver(new FakeLookupStore());
    const container = new Container(CONFIG, { client: new DevDigestApiClient('http://fake'), resolver: fakeResolver });
    expect(container.resolver).toBe(fakeResolver);
  });

  it('uses the overridden pollMs verbatim instead of leaving it undefined', () => {
    const container = new Container(CONFIG, { client: new DevDigestApiClient('http://fake'), pollMs: 10 });
    expect(container.pollMs).toBe(10);
  });

  it('builds the default resolver over the overridden client (calls resolveRepo through it, not a fresh client)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'r1', full_name: 'acme/payments-api' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const fakeClient = new DevDigestApiClient('http://fake-api');
    const container = new Container(CONFIG, { client: fakeClient });

    await container.resolver.resolveRepo('acme/payments-api');

    // Proves the default Resolver was built over THIS container's client
    // (`new LookupApiRepository(this.client)`), not a separately constructed one.
    expect(fetchMock).toHaveBeenCalledWith('http://fake-api/repos', expect.anything());
  });
});
