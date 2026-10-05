import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** `context_paths` on agents and skills over HTTP: round-trip, order, EC-3, no version bump. */
d('context_paths on agents and skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

  let seq = 0;
  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Ctx ${seq++}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json() as { id: string; version: number; context_paths?: string[] };
  }
  async function newSkill(app: Awaited<ReturnType<typeof makeApp>>, enabled = true) {
    return (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: `ctx-skill-${seq++}`, description: 'd', type: 'rubric', body: 'b', enabled },
      })
    ).json() as { id: string; version: number; context_paths?: string[] };
  }

  it('AC-9: an agent stores context_paths in order, and GET returns them; new agents start empty', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    expect(agent.context_paths).toEqual([]);
    const paths = ['specs/public-api.md', 'docs/architecture.md', '.devdigest/insights/q2.md'];
    const put = await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { context_paths: paths } });
    expect(put.statusCode).toBe(200);
    expect(put.json().context_paths).toEqual(paths);
    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(got.context_paths).toEqual(paths);
    await app.close();
  });

  it('AC-10: reordering attached paths stores the new order', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const url = `/agents/${agent.id}`;
    await app.inject({ method: 'PUT', url, payload: { context_paths: ['docs/a.md', 'docs/b.md'] } });
    const put = await app.inject({ method: 'PUT', url, payload: { context_paths: ['docs/b.md', 'docs/a.md'] } });
    expect(put.json().context_paths).toEqual(['docs/b.md', 'docs/a.md']);
    expect((await app.inject({ method: 'GET', url })).json().context_paths).toEqual(['docs/b.md', 'docs/a.md']);
    await app.close();
  });

  it('D-13: changing context_paths does not bump the agent version', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { context_paths: ['docs/a.md'] },
    });
    expect(put.json().version).toBe(agent.version);
    const versions = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('EC-3: an agent update with a path outside the glob or not .md is a 400 and stores nothing', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { context_paths: ['docs/keep.md'] } });
    for (const bad of ['src/app.ts', 'src/app.md', 'docs/x.txt', '../docs/x.md', 'docs/../../etc/passwd.md']) {
      const res = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { context_paths: ['docs/ok.md', bad] },
      });
      expect(res.statusCode, bad).toBe(400);
    }
    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(got.context_paths).toEqual(['docs/keep.md']);
    await app.close();
  });

  it('AC-14: a skill stores context_paths without bumping its version; EC-3 rejects bad paths', async () => {
    const app = await makeApp();
    const skill = await newSkill(app);
    expect(skill.context_paths).toEqual([]);
    const ok = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { context_paths: ['specs/a.md', 'docs/b.md'] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().context_paths).toEqual(['specs/a.md', 'docs/b.md']);
    expect(ok.json().version).toBe(skill.version);

    const bad = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { context_paths: ['src/app.ts'] } });
    expect(bad.statusCode).toBe(400);
    const got = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(got.context_paths).toEqual(['specs/a.md', 'docs/b.md']);
    await app.close();
  });

  it('AC-18/AC-20: enabledSkillContextPaths follows link order and skips disabled links and skills', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const a = await newSkill(app);
    const b = await newSkill(app);
    const linkOff = await newSkill(app);
    const skillOff = await newSkill(app, false);
    const put = (id: string, paths: string[]) =>
      app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { context_paths: paths } });
    await put(a.id, ['specs/public-api.md', 'docs/architecture.md']);
    await put(b.id, ['docs/b.md']);
    await put(linkOff.id, ['insights/perf-budget.md']);
    await put(skillOff.id, ['insights/skill-off.md']);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: b.id, enabled: true },
          { skill_id: linkOff.id, enabled: false },
          { skill_id: a.id, enabled: true },
          { skill_id: skillOff.id, enabled: true },
        ],
      },
    });
    const repo = new AgentsRepository(pg.handle.db);
    expect(await repo.enabledSkillContextPaths(agent.id)).toEqual([
      ['docs/b.md'],
      ['specs/public-api.md', 'docs/architecture.md'],
    ]);
    await app.close();
  });
});
