import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * The agent side of skills over HTTP: an ordered set with per-link switches,
 * the prompt lookup (link AND skill enabled, in order), the version bump a link
 * change causes, and the tenancy check on skill ids.
 */
d('agent skill links', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  let seq = 0;
  async function setup() {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: `Linked ${seq++}`,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review.',
        },
      })
    ).json() as { id: string };
    const skill = async (name: string, enabled = true) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: 'd', type: 'rubric', body: `${name} body`, enabled },
        })
      ).json() as { id: string };
    return { app, agentId: agent.id, skill };
  }

  it('keeps the order and per-link switch; the prompt sees only enabled skills', async () => {
    const { app, agentId, skill } = await setup();
    const a = await skill('alpha');
    const b = await skill('beta');
    const off = await skill('globally-off', false);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: b.id, enabled: true },
          { skill_id: a.id, enabled: false },
          { skill_id: off.id, enabled: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links.map((l: { name: string; link_enabled: boolean; order: number }) => [
      l.name,
      l.link_enabled,
      l.order,
    ])).toEqual([
      ['beta', true, 0],
      ['alpha', false, 1],
      ['globally-off', true, 2],
    ]);

    const prompt = await new AgentsRepository(pg.handle.db).enabledSkillsForPrompt(agentId);
    expect(prompt).toEqual([{ name: 'beta', body: 'beta body' }]);
    await app.close();
  });

  it('bumps the agent version and snapshots only the enabled links', async () => {
    const { app, agentId, skill } = await setup();
    const a = await skill('snap-a');
    const b = await skill('snap-b');
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: a.id, enabled: true }, { skill_id: b.id, enabled: false }] },
    });
    const agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(2);
    const [latest] = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(latest.config.skills).toEqual([a.id]);
    await app.close();
  });

  it('gives concurrent skill-set saves distinct agent versions, each snapshotted', async () => {
    const { app, agentId, skill } = await setup();
    const a = await skill('race-a');
    const b = await skill('race-b');
    const save = (ids: string[]) =>
      app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skills: ids.map((id) => ({ skill_id: id, enabled: true })) },
      });
    const res = await Promise.all([save([a.id]), save([b.id])]);
    expect(res.map((r) => r.statusCode)).toEqual([200, 200]);
    const versions = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    await app.close();
  });

  it('counts enabled skill links on the agents list', async () => {
    const { app, agentId, skill } = await setup();
    const a = await skill('count-a');
    const b = await skill('count-b');
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: a.id, enabled: true }, { skill_id: b.id, enabled: false }] },
    });
    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.find((x: { id: string }) => x.id === agentId).skill_count).toBe(1);
    await app.close();
  });

  it('seeds both skill-driven agents, disabled, with their skills linked in order (idempotent)', async () => {
    await seed(pg.handle.db); // second run must not duplicate anything
    const agents = await pg.handle.db.select().from(t.agents);
    const repo = new AgentsRepository(pg.handle.db);
    const linkedNames = async (name: string) => {
      const agent = agents.find((a) => a.name === name)!;
      expect(agent.enabled).toBe(false);
      return (await repo.linkedSkills(agent.id)).map((l) => l.skill.name);
    };
    expect(await linkedNames('Test Quality Reviewer')).toEqual([
      'test-coverage-nudge',
      'corner-case-checklist',
      'mocking-smells',
    ]);
    expect(await linkedNames('API Contract Reviewer')).toEqual([
      'breaking-change',
      'response-schema',
      'deprecation-policy',
    ]);
    const seeded = await pg.handle.db.select().from(t.skills);
    expect(seeded.filter((s) => s.name === 'mocking-smells')).toHaveLength(1);
  });

  it('seed renames a skill shipped under an old name instead of duplicating it', async () => {
    const [current] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'response-schema'));
    await pg.handle.db.update(t.skills).set({ name: 'response-shape-guard' }).where(eq(t.skills.id, current!.id));
    await seed(pg.handle.db);
    const rows = await pg.handle.db
      .select()
      .from(t.skills)
      .where(inArray(t.skills.name, ['response-schema', 'response-shape-guard']));
    expect(rows.map((r) => [r.id, r.name])).toEqual([[current!.id, 'response-schema']]);
  });

  it('lists agents oldest first, and an update does not move the row', async () => {
    const { app, agentId } = await setup();
    const before = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const first = before[0].id;
    await app.inject({ method: 'PUT', url: `/agents/${first}`, payload: { enabled: false } });
    await app.inject({ method: 'PUT', url: `/agents/${first}`, payload: { enabled: true } });
    const after = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(after.map((a: { id: string }) => a.id)).toEqual(before.map((a: { id: string }) => a.id));
    expect(after.at(-1).id).toBe(agentId); // just created → last
    await app.close();
  });

  it('rejects a skill from another workspace and a duplicated skill', async () => {
    const { app, agentId, skill } = await setup();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'o' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: other!.id,
        name: 'foreign',
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning();
    const foreignRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [foreign!.id] },
    });
    expect(foreignRes.statusCode).toBe(422);

    const a = await skill('dup');
    const dupRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a.id, a.id] },
    });
    expect(dupRes.statusCode).toBe(422);
    await app.close();
  });
});
