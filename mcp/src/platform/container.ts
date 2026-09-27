import type { Config } from './config.js';
import { DevDigestApiClient } from '../adapters/devdigest-api/client.js';
import { LookupApiRepository } from '../modules/_shared/repository.js';
import { Resolver } from '../modules/_shared/resolver.js';

/**
 * Tests construct a container with `overrides` to inject a fake HTTP client
 * (or a pre-built `Resolver` over one) and a short `pollMs` — mirrors server's
 * `ContainerOverrides` for adapters. This is the real test seam: a test builds
 * a real `Container` with these overrides instead of hand-assembling an
 * `AppContainer` object literal, so it exercises the same wiring production
 * code does. There is no per-module override here: a module's repository/
 * service are cross-cutting infra's CONSUMERS, built by that module's own
 * `tools.ts`, not by the container (see `AppContainer` below).
 */
export interface ContainerOverrides {
  client?: DevDigestApiClient;
  resolver?: Resolver;
  /** Poll interval override — the real test seam for `run_agent_on_pr`'s wait loop (tests pass a small value instead of the production 3s default). */
  pollMs?: number;
}

/**
 * What every module's `tools.ts` needs to build its own repository + service
 * — cross-cutting infra only (mirrors server's `Container`: config, db,
 * shared adapters/repos). A module's `tools.ts` constructs `new
 * <Feature>Service({ store: new <Feature>ApiRepository(container.client),
 * resolver: container.resolver })` itself, the same way a Fastify
 * `routes.ts` builds its service from `container.db`
 * (`server/src/modules/pulls/routes.ts:26-30`) — `platform/container.ts`
 * never constructs a module's repository or service.
 */
export interface AppContainer {
  client: DevDigestApiClient;
  resolver: Resolver;
  /** `run_agent_on_pr` polling budget in ms (`config.ts`'s `waitMs`). */
  waitMs: number;
  /** Poll interval override, mainly for tests. */
  pollMs?: number;
}

/**
 * Composition root: the only place (besides each module's own `tools.ts`,
 * which builds its own repository + service) that constructs a concrete
 * class — here, the HTTP client and the shared `Resolver` (+ its `_shared`
 * `LookupApiRepository`). `app.ts`/`server.ts` receive the finished
 * container and never construct anything themselves.
 */
export class Container implements AppContainer {
  readonly client: DevDigestApiClient;
  readonly resolver: Resolver;
  readonly waitMs: number;
  readonly pollMs?: number;

  constructor(config: Config, overrides: ContainerOverrides = {}) {
    this.client = overrides.client ?? new DevDigestApiClient(config.apiUrl);
    this.resolver = overrides.resolver ?? new Resolver(new LookupApiRepository(this.client));
    this.waitMs = config.waitMs;
    this.pollMs = overrides.pollMs;
  }
}
