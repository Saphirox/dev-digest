import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { GitHubPermissionError } from '../src/platform/errors.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-export] Docker not available — skipping integration tests.');
}

const REPO = 'acme/payments-api'; // seeded by `seed`

/** An LLM provider that fails the test if anything calls it (NFR-4). */
function forbiddenLlm(id: LLMProvider['id'], calls: string[]): LLMProvider {
  return new Proxy({ id } as unknown as LLMProvider, {
    get: (target, prop) =>
      prop === 'id'
        ? target.id
        : () => {
            calls.push(String(prop));
            throw new Error('LLM must not be called by Export to CI');
          },
  });
}

d('Export to CI over HTTP', () => {
  let pg: PgFixture;
  let llmCalls: string[];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    llmCalls = [];
    await pg.handle.db.delete(t.ciRuns);
    await pg.handle.db.delete(t.ciInstallations);
  });

  function makeApp(github = new MockGitHubClient(), bundle: { path: string; contents: string }[] | null = [{ path: 'index.js', contents: '// fake runner' }]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github,
        runnerBundle: { read: async () => bundle },
        llm: {
          openai: forbiddenLlm('openai', llmCalls),
          anthropic: forbiddenLlm('anthropic', llmCalls),
          openrouter: forbiddenLlm('openrouter', llmCalls),
        },
      },
    });
  }

  let seq = 0;
  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>, withSkill = true) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Exporter ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json() as { id: string; version: number };
    if (withSkill) {
      const skill = (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name: `Gate ${seq++}`, description: 'd', type: 'rubric', body: 'GATE BODY' },
        })
      ).json() as { id: string };
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });
    }
    const fresh = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json() as { version: number };
    return { id: agent.id, version: fresh.version };
  }

  const exportBody = (over: object = {}) => ({
    repo: REPO,
    action: 'open_pr',
    post_as: 'github_review',
    triggers: ['opened', 'synchronize'],
    ...over,
  });

  it('AC-3: preview lists the manifest, the skill, the runner and the workflow', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci/preview`,
      payload: { triggers: ['opened'], post_as: 'none' },
    });
    expect(res.statusCode).toBe(200);
    const paths = (res.json() as { files: { path: string }[] }).files.map((f) => f.path);
    expect(paths).toHaveLength(4);
    expect(paths[0]).toMatch(/^\.devdigest\/agents\/exporter-\d+\.yaml$/);
    expect(paths[1]).toMatch(/^\.devdigest\/skills\/gate-\d+\.md$/);
    expect(paths.slice(2)).toEqual(['.devdigest/runner/index.js', '.github/workflows/devdigest-review.yml']);
    expect(paths).not.toContain('.devdigest/memory.jsonl');
  });

  it('AC-3: a multi-file runner build is previewed and zipped file by file', async () => {
    const app = await makeApp(new MockGitHubClient(), [
      { path: 'index.js', contents: '// entry' },
      { path: '300.index.js', contents: '// chunk' },
      { path: 'package.json', contents: '{}' },
    ]);
    const agent = await newAgent(app);
    const preview = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci/preview`,
      payload: { triggers: ['opened'], post_as: 'none' },
    });
    const paths = (preview.json() as { files: { path: string }[] }).files.map((f) => f.path);
    expect(paths.filter((p) => p.startsWith('.devdigest/runner/'))).toEqual([
      '.devdigest/runner/index.js',
      '.devdigest/runner/300.index.js',
      '.devdigest/runner/package.json',
    ]);
    const zip = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: exportBody({ action: 'files' }),
    });
    const entries = unzipSync(new Uint8Array(zip.rawPayload));
    expect(strFromU8(entries['.devdigest/runner/300.index.js']!)).toBe('// chunk');
    expect(Object.keys(entries)).toHaveLength(6);
  });

  it('EC-7: preview answers 503 runner_bundle_missing when the bundle is not built', async () => {
    const app = await makeApp(new MockGitHubClient(), null);
    const agent = await newAgent(app, false);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci/preview`,
      payload: { triggers: ['opened'], post_as: 'none' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('runner_bundle_missing');
  });

  it('AC-15 / AC-16 / AC-18: open_pr commits to devdigest/ci, never the default branch, and records agent_version', async () => {
    const gh = new MockGitHubClient();
    const app = await makeApp(gh);
    const agent = await newAgent(app);
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: exportBody() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pr_url: string; installation: { repo: string; agent_version: number } };
    expect(body.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(body.installation).toMatchObject({ repo: REPO, agent_version: agent.version });
    expect(gh.committed.map((c) => [c.branch, c.base])).toEqual([['devdigest/ci', 'main']]);

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci/installations` });
    expect(list.json()).toMatchObject([{ repo: REPO, agent_version: agent.version, latest_run: null }]);
  });

  it('AC-17: files returns a zip holding every listed file and records nothing', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: exportBody({ action: 'files', workflow: 'name: kept edit\n' }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');
    const entries = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(entries)).toHaveLength(4);
    expect(strFromU8(entries['.github/workflows/devdigest-review.yml']!)).toBe('name: kept edit\n');
    expect(strFromU8(entries['.devdigest/runner/index.js']!)).toBe('// fake runner');
    expect(await pg.handle.db.select().from(t.ciInstallations)).toHaveLength(0);
  });

  it('EC-2: a refused commit answers github_workflow_permission and records no installation', async () => {
    const err = new GitHubPermissionError('Resource not accessible');
    const app = await makeApp(new MockGitHubClient({ commitError: err }));
    const agent = await newAgent(app);
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: exportBody() });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('github_workflow_permission');
    expect(await pg.handle.db.select().from(t.ciInstallations)).toHaveLength(0);
  });

  it('EC-16: a second agent exporting to the same repo gets 409 and nothing is committed', async () => {
    const gh = new MockGitHubClient();
    const app = await makeApp(gh);
    const first = await newAgent(app, false);
    const second = await newAgent(app, false);
    expect((await app.inject({ method: 'POST', url: `/agents/${first.id}/export-ci`, payload: exportBody() })).statusCode).toBe(200);
    const res = await app.inject({ method: 'POST', url: `/agents/${second.id}/export-ci`, payload: exportBody() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ci_repo_taken');
    expect(gh.committed).toHaveLength(1);
  });

  it('AC-26: no route accepts CI results', async () => {
    const app = await makeApp();
    for (const url of ['/ci/runs', '/ci/runs/ingest', '/ci/results', '/ci/runs/result']) {
      const res = await app.inject({ method: 'POST', url, payload: { findings_count: 1, cost_usd: 0, agent: 'x' } });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('NFR-4: no LLM provider is called by any export route', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci/preview`, payload: {} });
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: exportBody() });
    await app.inject({ method: 'POST', url: '/ci/runs/refresh' });
    expect(llmCalls).toEqual([]);
  });
});
