import { describe, it, expect } from 'vitest';
import { AgentManifest, type CiExportInput } from '@devdigest/shared';
import { CiService, type ExportOutcome } from '../src/modules/ci/service.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { ConfigError, GitHubPermissionError } from '../src/platform/errors.js';
import type {
  CiAgentRecord,
  CiInstallationRecord,
  CiRunInput,
  CiStore,
} from '../src/modules/ci/ports.js';

const WS = 'ws-1';
const agent: CiAgentRecord = {
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'openai/gpt-4.1',
  systemPrompt: 'Review.',
  strategy: 'auto',
  ciFailOn: 'critical',
  version: 4,
};

class FakeStore implements CiStore {
  installs: CiInstallationRecord[] = [];
  runs = new Map<number, CiRunInput>();
  async findInstallationByRepo(_ws: string, repo: string) {
    return this.installs.find((i) => i.repo === repo);
  }
  async upsertInstallation(_ws: string, agentId: string, repo: string, agentVersion: number, manifest: AgentManifest) {
    const rec: CiInstallationRecord = {
      id: `inst-${this.installs.length + 1}`,
      agentId,
      agentName: agent.name,
      repo,
      targetType: 'gha',
      installedAt: new Date('2026-10-01T00:00:00Z'),
      agentVersion,
      manifest,
      latestRun: null,
    };
    this.installs.push(rec);
    return rec;
  }
  async listInstallations() {
    return this.installs;
  }
  async storedAttempt(_ws: string, id: number) {
    return this.runs.get(id)?.runAttempt ?? null;
  }
  async saveCiRun(_ws: string, input: CiRunInput) {
    this.runs.set(input.githubRunId, input);
  }
  async listRuns() {
    return [];
  }
}

function setup(opts: { bundle?: { path: string; contents: string }[] | null; github?: MockGitHubClient | Error } = {}) {
  const store = new FakeStore();
  const gh = opts.github instanceof Error ? undefined : (opts.github ?? new MockGitHubClient());
  const warnings: string[] = [];
  const service = new CiService({
    store,
    agents: {
      find: async (_ws, id) => (id === agent.id ? agent : undefined),
      enabledSkills: async () => [{ name: 'Gate', body: 'GATE BODY' }],
    },
    repos: { exists: async (_ws, name) => name === 'acme/payments-api' },
    bundle: {
      read: async () =>
        opts.bundle === undefined ? [{ path: 'index.js', contents: '// runner' }] : opts.bundle,
    },
    github: {
      resolve: async () => {
        if (opts.github instanceof Error) throw opts.github;
        return gh!;
      },
    },
    warn: (m) => warnings.push(m),
  });
  return { service, store, gh: gh!, warnings };
}

const input = (over: Partial<CiExportInput> = {}): CiExportInput => ({
  repo: 'acme/payments-api',
  target: 'gha',
  action: 'open_pr',
  post_as: 'github_review',
  triggers: ['opened', 'synchronize'],
  ...over,
});

const pr = (o: ExportOutcome) => {
  if (o.kind !== 'pr') throw new Error('expected a PR outcome');
  return o.result;
};

describe('export (open_pr)', () => {
  it('AC-16 / AC-15: commits to devdigest/ci from the default branch, opens a PR, records the installation', async () => {
    const { service, store, gh } = setup({ github: new MockGitHubClient({ defaultBranch: 'trunk' }) });
    const res = pr(await service.export(WS, agent.id, input()));
    expect(gh.committed).toHaveLength(1);
    expect(gh.committed[0]!.branch).toBe('devdigest/ci');
    expect(gh.committed[0]!.base).toBe('trunk');
    expect(gh.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: 'devdigest/ci', base: 'trunk' });
    expect(res.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(store.installs[0]).toMatchObject({ repo: 'acme/payments-api', agentVersion: 4 });
  });

  it('AC-16: refuses when the default branch is devdigest/ci itself', async () => {
    const { service, gh } = setup({ github: new MockGitHubClient({ defaultBranch: 'devdigest/ci' }) });
    await expect(service.export(WS, agent.id, input())).rejects.toMatchObject({ code: 'ci_branch_is_default' });
    expect(gh.committed).toHaveLength(0);
  });

  it('EC-3: an open PR on devdigest/ci is reused, not duplicated', async () => {
    const { service, gh } = setup();
    await gh.openPullRequest({ owner: 'acme', name: 'payments-api' }, { title: 't', head: 'devdigest/ci', base: 'main', body: '' });
    await service.export(WS, agent.id, input());
    expect(gh.committed).toHaveLength(1);
    expect(gh.openedPrs).toHaveLength(1);
  });

  it('EC-4: a branch without an open PR gets a new PR', async () => {
    const { service, gh } = setup();
    await service.export(WS, agent.id, input());
    expect(gh.openedPrs).toHaveLength(1);
  });

  it('EC-1: a missing GitHub token maps to github_not_configured; the zip still works', async () => {
    const { service, store } = setup({ github: new ConfigError('GITHUB_TOKEN is not configured') });
    await expect(service.export(WS, agent.id, input())).rejects.toMatchObject({
      code: 'github_not_configured',
      statusCode: 400,
    });
    const zip = await service.export(WS, agent.id, input({ action: 'files' }));
    expect(zip.kind).toBe('zip');
    expect(store.installs).toHaveLength(0);
  });

  it('EC-2: a refused commit maps to github_workflow_permission and records no installation', async () => {
    const err = new GitHubPermissionError('Resource not accessible by personal access token');
    const { service, store } = setup({ github: new MockGitHubClient({ commitError: err }) });
    await expect(service.export(WS, agent.id, input())).rejects.toMatchObject({
      code: 'github_workflow_permission',
      statusCode: 403,
    });
    expect(store.installs).toHaveLength(0);
  });

  it('EC-16: a different agent in the repo blocks the export before any commit', async () => {
    const { service, store, gh } = setup();
    store.installs.push({
      id: 'i0',
      agentId: 'other-agent',
      agentName: 'Performance Reviewer',
      repo: 'acme/payments-api',
      targetType: 'gha',
      installedAt: new Date(),
      agentVersion: 1,
      manifest: null,
      latestRun: null,
    });
    await expect(service.export(WS, agent.id, input())).rejects.toMatchObject({
      code: 'ci_repo_taken',
      statusCode: 409,
      message: 'acme/payments-api already runs Performance Reviewer',
      details: { agent_name: 'Performance Reviewer' },
    });
    expect(gh.committed).toHaveLength(0);
  });

  it('a repository outside the workspace is not found', async () => {
    const { service } = setup();
    await expect(service.export(WS, agent.id, input({ repo: 'evil/other' }))).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('AC-4: a kept workflow edit is what gets committed', async () => {
    const { service, gh } = setup();
    await service.export(WS, agent.id, input({ workflow: 'name: edited\n' }));
    const wf = gh.committed[0]!.files.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(wf?.contents).toBe('name: edited\n');
  });
});

describe('EC-7: runner bundle missing', () => {
  it('preview and export fail with runner_bundle_missing naming the bundle', async () => {
    const { service } = setup({ bundle: null });
    const p = service.preview(WS, agent.id, { triggers: ['opened'], post_as: 'none' });
    await expect(p).rejects.toMatchObject({ code: 'runner_bundle_missing', statusCode: 503 });
    await expect(p).rejects.toThrow(/agent-runner\/dist\/index\.js/);
    await expect(service.export(WS, agent.id, input())).rejects.toMatchObject({ code: 'runner_bundle_missing' });
  });
});

describe('refresh', () => {
  const run = (id: number, attempt = 1) => ({
    id,
    attempt,
    head_sha: 'abc123',
    html_url: `https://github.com/acme/payments-api/actions/runs/${id}`,
    pr_number: 128,
    started_at: '2026-10-02T10:00:00Z',
  });
  const artifact = (o: object) => ({ kind: 'ok' as const, text: JSON.stringify(o) });
  const valid = { findings_count: 3, critical: 0, warning: 2, suggestion: 1, cost_usd: 0.0123, duration_ms: 41250, agent: 'x', version: '1', pr_number: 128 };

  async function seeded(github: MockGitHubClient | Error) {
    const s = setup({ github });
    await s.store.upsertInstallation(WS, agent.id, 'acme/payments-api', 4, AgentManifest.parse({
      name: agent.name, model: 'openai/gpt-4.1', system_prompt: 'p', skills: ['gate'], ci_fail_on: 'critical',
    }));
    return s;
  }

  it('AC-31 / EC-9 / EC-17: valid, invalid and missing artifacts in one refresh', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1), run(2), run(3)],
      artifacts: {
        1: artifact(valid),
        2: artifact({ findings_count: '3', cost_usd: 'free', agent: 'x' }),
        // run 3: no artifact
      },
    });
    const { service, store } = await seeded(gh);
    expect(await service.refresh(WS)).toEqual({ ingested: 3, failed_repos: [] });
    expect(store.runs.get(1)).toMatchObject({ verdict: 'passed', agentRun: { status: 'done', findingsCount: 3, costUsd: 0.0123 } });
    expect(store.runs.get(1)!.agentRun!.trace).toMatchObject({
      kind: 'ci', agent_version: 4, model: 'openai/gpt-4.1', runner_version: '1', skills: ['gate'], head_sha: 'abc123',
    });
    expect(store.runs.get(2)).toMatchObject({ verdict: 'failed', agentRun: null });
    expect(store.runs.get(3)).toMatchObject({ verdict: 'failed', agentRun: { status: 'failed', findingsCount: null, costUsd: null } });
  });

  it('SEC-1 / EC-9: a run the store rejects is skipped and the next run is still saved', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1), run(2)],
      artifacts: { 1: artifact(valid), 2: artifact(valid) },
    });
    const { service, store, warnings } = await seeded(gh);
    const save = store.saveCiRun.bind(store);
    store.saveCiRun = async (ws, input) => {
      if (input.githubRunId === 1) throw new Error('value out of range for type integer');
      return save(ws, input);
    };
    expect(await service.refresh(WS)).toEqual({ ingested: 1, failed_repos: [] });
    expect(store.runs.has(1)).toBe(false);
    expect(store.runs.has(2)).toBe(true);
    expect(warnings.join('\n')).toContain('value out of range for type integer');
  });

  it('NFR-2: an oversized artifact is stored as failed with no agent run', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [run(1)], artifacts: { 1: { kind: 'too_large' } } });
    const { service, store } = await seeded(gh);
    await service.refresh(WS);
    expect(store.runs.get(1)).toMatchObject({ verdict: 'failed', agentRun: null });
  });

  it('SEC-1: a corrupt artifact archive is stored as failed and later runs still ingest', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [run(1), run(2)],
      artifacts: { 1: { kind: 'invalid' }, 2: artifact(valid) },
    });
    const { service, store } = await seeded(gh);
    expect(await service.refresh(WS)).toEqual({ ingested: 2, failed_repos: [] });
    expect(store.runs.get(1)).toMatchObject({ verdict: 'failed', agentRun: null });
    expect(store.runs.has(2)).toBe(true);
  });

  it('EC-8: a run is skipped unless the listed attempt is newer than the stored one', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [run(1, 1)], artifacts: { 1: artifact(valid) } });
    const { service, store } = await seeded(gh);
    expect((await service.refresh(WS)).ingested).toBe(1);
    expect((await service.refresh(WS)).ingested).toBe(0);
    store.runs.get(1)!.runAttempt = 1;
    const gh2 = new MockGitHubClient({ workflowRuns: [run(1, 2)], artifacts: { 1: artifact(valid) } });
    (service as unknown as { deps: { github: unknown } }).deps.github = { resolve: async () => gh2 };
    expect((await service.refresh(WS)).ingested).toBe(1);
    expect(store.runs.get(1)!.runAttempt).toBe(2);
  });

  it('EC-15: a 403 listing or downloading puts the repo in failed_repos and does not throw', async () => {
    const rateLimited = Object.assign(new Error('API rate limit exceeded'), { status: 403 });
    const { service, warnings } = await seeded(new MockGitHubClient({ workflowRuns: rateLimited }));
    expect(await service.refresh(WS)).toEqual({ ingested: 0, failed_repos: ['acme/payments-api'] });
    expect(warnings[0]).toContain('API rate limit exceeded');

    const gh = new MockGitHubClient({ workflowRuns: [run(1)], artifacts: { 1: rateLimited } });
    const second = await seeded(gh);
    expect((await second.service.refresh(WS)).failed_repos).toEqual(['acme/payments-api']);
  });

  it('EC-15: a missing GitHub token fails every repo instead of throwing', async () => {
    const { service } = await seeded(new ConfigError('GITHUB_TOKEN is not configured'));
    expect(await service.refresh(WS)).toEqual({ ingested: 0, failed_repos: ['acme/payments-api'] });
  });

  it('with no installations nothing is resolved and nothing fails', async () => {
    const { service } = setup({ github: new ConfigError('no token') });
    expect(await service.refresh(WS)).toEqual({ ingested: 0, failed_repos: [] });
  });
});
