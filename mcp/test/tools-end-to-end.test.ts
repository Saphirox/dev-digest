/**
 * End-to-end module coverage over the SDK's `InMemoryTransport`, one module
 * at a time — `tools.test.ts` (contract + budget) never exercises the happy
 * path of `list_agents`/`get_conventions`/`get_findings`, nor any input
 * validation failure; this file fills that gap using the same seam: a real
 * `Container` built with `{ client: fake, pollMs }` overrides (per
 * `mcp/AGENTS.md`'s test-placement rule — a fake HTTP client, not a
 * per-module fake store), so each module's real `tools.ts`-built repository +
 * service runs on top of the real `Container`/`Resolver` wiring.
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
import type { ReviewRecord } from '../src/modules/reviews/ports.js';

const REPO: RepoRecord = { id: 'repo-1', full_name: 'acme/payments-api' };
const PR: PullRecord = { id: 'pr-1', number: 7 };
const AGENT = { id: 'agent-1', name: 'Reviewer', description: 'Reviews things', model: 'gpt-5', enabled: true };

const CONVENTIONS: ConventionListRecord = {
  last_scan_at: '2026-09-01T00:00:00Z',
  conventions: [
    { rule: 'no-any', category: 'types', status: 'pending', evidence_path: 'b.ts', evidence_line: 3 },
    { rule: 'kebab-case files', category: 'naming', status: 'accepted', evidence_path: 'a.ts', evidence_line: 1 },
  ],
};

const REVIEW: ReviewRecord = {
  id: 'rev-1',
  agent_id: AGENT.id,
  agent_name: AGENT.name,
  run_id: 'run-1',
  verdict: 'request_changes',
  score: 40,
  created_at: '2026-09-01T00:00:00Z',
  findings: [
    {
      severity: 'CRITICAL',
      category: 'security',
      title: 'SQL injection',
      file: 'src/db.ts',
      start_line: 10,
      end_line: 12,
      rationale: 'user input reaches a raw query',
      suggestion: 'use a parameterized query',
      dismissed_at: null,
    },
  ],
};

/** Wide enough to serve every module's endpoint (mirrors `tools.test.ts`'s `FakeApiClient`). */
class FakeApiClient {
  async get(path: string): Promise<unknown> {
    if (path === '/repos') return [REPO];
    if (path === '/agents') return [AGENT];
    if (path === `/repos/${REPO.id}/pulls`) return [PR];
    if (path === `/repos/${REPO.id}/conventions`) return CONVENTIONS;
    if (path === `/pulls/${PR.id}/runs`) return [];
    if (path === `/pulls/${PR.id}/runs/active`) return [];
    if (path === `/pulls/${PR.id}/reviews`) return [REVIEW];
    throw new Error(`FakeApiClient: unhandled GET ${path}`);
  }

  async post(path: string, _body: unknown): Promise<unknown> {
    throw new Error(`FakeApiClient: unhandled POST ${path}`);
  }
}

function makeContainer(): AppContainer {
  const client = new FakeApiClient() as unknown as DevDigestApiClient;
  return new Container({ apiUrl: 'http://fake', waitMs: 30 }, { client, pollMs: 10 });
}

async function connectedClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('module tools — happy paths (InMemoryTransport)', () => {
  let client: Client;

  beforeEach(async () => {
    const server = createApp(makeContainer());
    client = await connectedClient(server);
  });

  afterEach(async () => {
    await client.close();
  });

  it('list_agents: structuredContent lists the agent, text is line-format (not JSON)', async () => {
    const result = await client.callTool({ name: 'list_agents', arguments: {} });

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as { agents: { id: string; name: string; enabled: boolean }[] };
    expect(sc.agents).toEqual([expect.objectContaining({ id: 'agent-1', name: 'Reviewer', enabled: true })]);

    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(() => JSON.parse(text)).toThrow();
    expect(text).toBe('ENABLED  Reviewer (agent-1, gpt-5)');
  });

  it('get_conventions: accepted-first ordering in structuredContent, line-format text', async () => {
    const result = await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/payments-api' },
    });

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as { conventions: { rule: string; status: string }[]; more: number };
    expect(sc.conventions.map((c) => c.rule)).toEqual(['kebab-case files', 'no-any']);
    expect(sc.conventions[0]?.status).toBe('accepted');
    expect(sc.more).toBe(0);

    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(() => JSON.parse(text)).toThrow();
    expect(text.split('\n')[0]).toBe('[accepted] (naming) kebab-case files — a.ts:1');
  });

  it('get_findings: status done, structuredContent + a DONE header line (not JSON) in text', async () => {
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/payments-api', pr: 7 },
    });

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as { status: string; verdict: string; findings: unknown[] };
    expect(sc.status).toBe('done');
    expect(sc.verdict).toBe('request_changes');
    expect(sc.findings).toHaveLength(1);

    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(() => JSON.parse(text)).toThrow();
    expect(text.split('\n')[0]).toContain('DONE acme/payments-api#7');
    expect(text).toContain('CRITICAL src/db.ts:10 SQL injection');
  });
});

describe('module tools — input validation (isError, forward-leading)', () => {
  let client: Client;

  beforeEach(async () => {
    const server = createApp(makeContainer());
    client = await connectedClient(server);
  });

  afterEach(async () => {
    await client.close();
  });

  it('get_findings: rejects a repo that does not match owner/name with the regex hint', async () => {
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'not-a-valid-repo', pr: 7 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toMatch(/owner\/name/i);
  });

  it('get_findings: rejects pr <= 0', async () => {
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/payments-api', pr: 0 },
    });

    expect(result.isError).toBe(true);
  });

  it('get_findings: rejects limit > 50', async () => {
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/payments-api', pr: 7, limit: 51 },
    });

    expect(result.isError).toBe(true);
  });

  it('run_agent_on_pr: rejects a repo that does not match owner/name with the regex hint', async () => {
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'bad repo', pr: 7, agent: 'Reviewer' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toMatch(/owner\/name/i);
  });
});
