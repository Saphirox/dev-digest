/**
 * Contract + budget tests for the composed app (plan step 7): a real
 * `Client` talking to `createApp(container)` over the SDK's in-memory linked
 * transport, backed by a real `Container` built with `{ client: fake, pollMs
 * }` overrides — the same seam production code uses, not a hand-assembled
 * `AppContainer` object literal, so the real `Container` wiring (the default
 * `Resolver` built over the fake client) gets exercised too, on top of each
 * module's `tools.ts` building its OWN real repository + service from the
 * container (item A: "tools own their repository/service"). No network, no
 * shared dev DB (root INSIGHTS 2026-09-21).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { createApp } from '../src/app.js';
import { Container } from '../src/platform/container.js';
import type { AppContainer } from '../src/platform/container.js';
import type { DevDigestApiClient } from '../src/adapters/devdigest-api/client.js';
import type { RepoRecord, PullRecord } from '../src/modules/_shared/ports.js';
import type { ConventionListRecord } from '../src/modules/conventions/ports.js';
import type { RunStatusRecord, StartReviewRunRecord } from '../src/modules/reviews/ports.js';
import type { BlastRadiusRecord } from '../src/modules/blast/ports.js';
import { fakeAgent } from './fakes.js';
import {
  toToolResult,
  waitExhaustedMessage,
  getFindingsRunningMessage,
  noReviewsMessage,
  noConventionsMessage,
  fullDetailHint,
} from '../src/modules/_shared/messages.js';
import {
  ApiUnreachable,
  ApiFailure,
  RateLimited,
  RepoNotFound,
  PrNotFound,
  AgentNotFound,
  AgentAmbiguous,
  RunNotFound,
  RunFailed,
  MalformedResponse,
  NoRunStarted,
} from '../src/platform/errors.js';

const REPO: RepoRecord = { id: 'repo-1', full_name: 'acme/payments-api' };
const PR: PullRecord = { id: 'pr-1', number: 7 };
const AGENT = fakeAgent({ id: 'agent-1', name: 'Reviewer' });

const TOOL_NAMES = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];

/**
 * Fakes the HTTP boundary (`DevDigestApiClient.get`/`post`) one level below
 * every module's real `repository.ts` — the container-level equivalent of
 * `repositories.test.ts`'s `FakeClient`, wide enough to serve every module's
 * endpoint. `run_agent_on_pr`'s poll never sees `status:'done'`, so it always
 * exhausts its (tiny, test-sized) wait budget — same script as before.
 */
class FakeApiClient {
  async get(path: string): Promise<unknown> {
    if (path === '/repos') return [REPO];
    if (path === '/agents') return [AGENT];
    if (path === `/repos/${REPO.id}/pulls`) return [PR];
    if (path === `/repos/${REPO.id}/conventions`) {
      return { conventions: [], last_scan_at: null } satisfies ConventionListRecord;
    }
    if (path === `/pulls/${PR.id}/runs`) {
      return [{ run_id: 'run-1', status: 'running', error: null }] satisfies RunStatusRecord[];
    }
    if (path === `/pulls/${PR.id}/runs/active`) return [];
    if (path === `/pulls/${PR.id}/reviews`) return [];
    if (path === `/pulls/${PR.id}/blast`) {
      return {
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
      } satisfies BlastRadiusRecord;
    }
    throw new Error(`FakeApiClient: unhandled GET ${path}`);
  }

  async post(path: string, _body: unknown): Promise<unknown> {
    if (path === `/pulls/${PR.id}/review`) {
      return {
        runs: [{ run_id: 'run-1', agent_id: AGENT.id, agent_name: AGENT.name }] satisfies StartReviewRunRecord[],
      };
    }
    throw new Error(`FakeApiClient: unhandled POST ${path}`);
  }
}

function fakeClient(): DevDigestApiClient {
  return new FakeApiClient() as unknown as DevDigestApiClient;
}

function makeContainer(): AppContainer {
  return new Container({ apiUrl: 'http://fake', waitMs: 30 }, { client: fakeClient(), pollMs: 10 });
}

async function connectedClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('mcp tools (InMemoryTransport contract)', () => {
  let client: Client;

  beforeEach(async () => {
    const server = createApp(makeContainer());
    client = await connectedClient(server);
  });

  afterEach(async () => {
    await client.close();
  });

  it('exposes exactly the 5 tools named by the rubric', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('sets the annotations the plan\'s compliance matrix specifies per tool', async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(byName.list_agents?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(byName.run_agent_on_pr?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(byName.get_findings?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(byName.get_conventions?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(byName.get_blast_radius?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
  });

  it('keeps the server instructions at or under the 160 char budget', () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeDefined();
    expect(instructions!.length).toBeLessThanOrEqual(160);
  });

  it('keeps the serialized tools/list payload at or under the ~6,000 char (1.5k token) budget', async () => {
    const { tools } = await client.listTools();
    const size = JSON.stringify(tools).length;
    // eslint-disable-next-line no-console -- measured number the plan asks to print, test-only.
    console.log(`tools/list serialized size: ${size} chars`);
    expect(size).toBeLessThanOrEqual(6_000);
  });

  it('renders the blast radius with the caller file:line and the degraded reason text', async () => {
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr: 7 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0]?.text).toContain('src/checkout.ts:42');
    expect(content[0]?.text).toContain('partially built');
  });

  it('returns isError for an unknown PR on get_blast_radius', async () => {
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr: 999 },
    });
    expect(result.isError).toBe(true);
  });

  it('returns status "running" with the run_id and a get_findings pointer once the wait budget is exhausted', async () => {
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: 7, agent: 'Reviewer' },
    });
    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as { status: string; run_id: string };
    expect(sc.status).toBe('running');
    expect(sc.run_id).toBe('run-1');
    const content = result.content as { type: string; text: string }[];
    expect(content[0]?.text).toContain('get_findings');
    expect(content[0]?.text).toContain('run-1');
  }, 10_000);

  it('delivers a progress notification to the client when a progressToken is sent', async () => {
    const received: unknown[] = [];
    client.setNotificationHandler('notifications/progress', (notification) => {
      received.push(notification);
    });

    await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: 7, agent: 'Reviewer' },
      _meta: { progressToken: 'progress-token-1' },
    });

    expect(received.length).toBeGreaterThan(0);
  }, 10_000);
});

describe('mcp message catalogue (errors lead forward)', () => {
  // Same regex the plan's step 7 specifies, broadened with `|findings` because
  // the literal "Bad run_id" text ("...for the latest findings...") names the
  // next step without spelling out the tool name `get_findings` — see the
  // implementer report's Deviations.
  const FORWARD_LEADING = /list_agents|run_agent_on_pr|get_findings|retry|\.\/scripts\/dev\.sh|DevDigest UI|Settings|findings/i;

  const ctx = { tool: 'run_agent_on_pr', repo: 'acme/payments-api', pr: 7 };

  function textOf(result: ReturnType<typeof toToolResult>): string {
    const content = result.content as { type: string; text: string }[] | undefined;
    return content?.[0]?.text ?? '';
  }

  const errorTexts = [
    toToolResult(new ApiUnreachable('http://localhost:3001'), ctx),
    toToolResult(new ApiFailure(500, 'boom'), ctx),
    toToolResult(new RateLimited(), ctx),
    toToolResult(new RepoNotFound('acme/x', ['acme/payments-api']), ctx),
    toToolResult(new PrNotFound('acme/payments-api', 999, [7]), ctx),
    toToolResult(new AgentNotFound('bogus'), ctx),
    toToolResult(new AgentAmbiguous('rev', ['Reviewer', 'Reviewer2']), ctx),
    toToolResult(new RunNotFound('run-x'), ctx),
    toToolResult(new RunFailed('run-1', 'failed', 'provider key missing'), ctx),
    toToolResult(new RunFailed('run-1', 'cancelled', null), ctx),
    toToolResult(new MalformedResponse('GET /pulls/:id/runs'), ctx),
    toToolResult(new NoRunStarted('pr-1'), ctx),
  ].map(textOf);

  const okTexts = [
    waitExhaustedMessage({ elapsedS: 100, repo: 'acme/payments-api', pr: 7, runId: 'run-1' }),
    getFindingsRunningMessage(),
    noReviewsMessage('acme/payments-api#7'),
    noConventionsMessage('acme/payments-api'),
    fullDetailHint('run-1'),
  ];

  it.each([...errorTexts, ...okTexts])('leads forward to a next tool or step: %s', (text) => {
    expect(text).toMatch(FORWARD_LEADING);
  });

  it('every error catalogue result is isError:true', () => {
    for (const result of [
      toToolResult(new ApiUnreachable('http://localhost:3001'), ctx),
      toToolResult(new ApiFailure(500, 'boom'), ctx),
      toToolResult(new RateLimited(), ctx),
      toToolResult(new RunNotFound('run-x'), ctx),
    ]) {
      expect(result.isError).toBe(true);
    }
  });
});
