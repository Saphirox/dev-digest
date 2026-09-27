/**
 * Fakes for every module's store — no network, no shared dev DB (root
 * INSIGHTS 2026-09-21: shared dev DB rows get replaced by other sessions
 * mid-task). Each method is a small in-memory stand-in the caller configures
 * via the constructor options; every call is recorded for assertions.
 */
import type { AgentRef, LookupStore, PullRecord, RepoRecord } from '../src/modules/_shared/ports.js';
import type { AgentRecord, AgentsStore } from '../src/modules/agents/ports.js';
import type {
  ReviewRecord,
  ReviewsStore,
  RunStatusRecord,
  StartReviewRunRecord,
} from '../src/modules/reviews/ports.js';
import type { ConventionListRecord, ConventionsStore } from '../src/modules/conventions/ports.js';

// ---- _shared / resolver -----------------------------------------------

export interface FakeLookupData {
  repos?: RepoRecord[];
  pulls?: Record<string, PullRecord[]>;
  agents?: AgentRef[];
}

export class FakeLookupStore implements LookupStore {
  readonly calls: { method: string; args: unknown[] }[] = [];

  constructor(private readonly data: FakeLookupData = {}) {}

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async listRepos(): Promise<RepoRecord[]> {
    this.record('listRepos', []);
    return this.data.repos ?? [];
  }

  async listPulls(repoId: string): Promise<PullRecord[]> {
    this.record('listPulls', [repoId]);
    return this.data.pulls?.[repoId] ?? [];
  }

  async listAgents(): Promise<AgentRef[]> {
    this.record('listAgents', []);
    return this.data.agents ?? [];
  }
}

export function fakeAgentRef(overrides: Partial<AgentRef> = {}): AgentRef {
  return { id: 'agent-1', name: 'Reviewer', ...overrides };
}

// ---- agents -------------------------------------------------------------

export function fakeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-1',
    name: 'Reviewer',
    description: 'A reviewer agent',
    model: 'gpt-5',
    enabled: true,
    ...overrides,
  };
}

export class FakeAgentsStore implements AgentsStore {
  constructor(private readonly agents: AgentRecord[] = []) {}

  async listAgents(): Promise<AgentRecord[]> {
    return this.agents;
  }
}

// ---- conventions ---------------------------------------------------------

export class FakeConventionsStore implements ConventionsStore {
  constructor(
    private readonly data: ConventionListRecord = { conventions: [], last_scan_at: null },
  ) {}

  async listConventions(): Promise<ConventionListRecord> {
    return this.data;
  }
}

// ---- reviews --------------------------------------------------------------

/** Scripted fake — one behaviour per `listRuns`/`listReviews` call index, to
 * drive the exact multi-poll sequences `reviews-service.test.ts` asserts on. */
export interface ReviewsScript {
  startReviewResult?: StartReviewRunRecord[];
  startReviewError?: (call: number) => Error | undefined;
  listRuns?: (call: number) => RunStatusRecord[] | Error;
  listActiveRuns?: (call: number) => RunStatusRecord[];
  listReviews?: (call: number) => ReviewRecord[];
}

export class ScriptedReviewsStore implements ReviewsStore {
  runsCallCount = 0;
  reviewsCallCount = 0;
  activeRunsCallCount = 0;
  startReviewCallCount = 0;
  readonly runsCalls: number[] = [];

  constructor(private readonly script: ReviewsScript = {}) {}

  async startReview(): Promise<StartReviewRunRecord[]> {
    const call = this.startReviewCallCount;
    this.startReviewCallCount += 1;
    const err = this.script.startReviewError?.(call);
    if (err) throw err;
    return this.script.startReviewResult ?? [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer' }];
  }

  async listRuns(): Promise<RunStatusRecord[]> {
    const call = this.runsCallCount;
    this.runsCalls.push(Date.now());
    this.runsCallCount += 1;
    const result = this.script.listRuns?.(call) ?? [{ run_id: 'run1', status: 'running', error: null }];
    if (result instanceof Error) throw result;
    return result;
  }

  async listActiveRuns(): Promise<RunStatusRecord[]> {
    const call = this.activeRunsCallCount;
    this.activeRunsCallCount += 1;
    return this.script.listActiveRuns?.(call) ?? [];
  }

  async listReviews(): Promise<ReviewRecord[]> {
    const call = this.reviewsCallCount;
    this.reviewsCallCount += 1;
    return this.script.listReviews?.(call) ?? [];
  }
}

export function fakeReview(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'rev1',
    agent_id: 'agent-1',
    agent_name: 'Reviewer',
    run_id: 'run1',
    verdict: 'approve',
    score: 92,
    created_at: '2026-01-01T00:00:00Z',
    findings: [],
    ...overrides,
  };
}
