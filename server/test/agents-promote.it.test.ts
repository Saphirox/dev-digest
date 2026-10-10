import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
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
  console.warn('[agents-promote] Docker not available — skipping integration tests.');
}

/**
 * Promote = restore version N's saved config as a NEW latest version
 * (POST /agents/:id/versions/:version/promote). Covers the config copy and the
 * skill links in order, untouched snapshots, the no-snapshot and deleted-skill
 * 409s (nothing changes) and the 404s.
 */
d('POST /agents/:id/versions/:version/promote', () => {
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
  async function setup() {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Promote ${seq++}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Original prompt.' },
      })
    ).json() as { id: string };
    const skill = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name: `${name} ${seq}`, description: 'd', type: 'rubric', body: `${name} body` },
        })
      ).json() as { id: string };
    const versions = async () =>
      (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json() as {
        version: number;
        config: Record<string, unknown>;
        created_at: string;
      }[];
    return { app, agentId: agent.id, skill, versions };
  }

  it("AC-40/AC-41: restores v2's config and skill order as v4; v1-v3 snapshots stay unchanged", async () => {
    const { app, agentId, skill, versions } = await setup();
    const a = await skill('alpha');
    const b = await skill('beta');
    // v2: a prompt + model edit; v3: skills linked in the order b, a.
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'Prompt two.', model: 'gpt-4.1', strategy: 'map-reduce' } });
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [b.id, a.id] } });
    // v4: the live config drifts away from v3.
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'Prompt four.', model: 'gpt-4o', strategy: 'single-pass' } });
    const before = await versions();
    expect(before.map((v) => v.version)).toEqual([4, 3, 2, 1]);

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/3/promote` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: agentId, version: 5, system_prompt: 'Prompt two.', model: 'gpt-4.1', strategy: 'map-reduce' });

    const live = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(live).toMatchObject({ version: 5, system_prompt: 'Prompt two.', model: 'gpt-4.1', provider: 'openai', strategy: 'map-reduce' });

    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json() as { id: string; order: number; link_enabled: boolean }[];
    expect(links.map((l) => l.id)).toEqual([b.id, a.id]);
    expect(links.every((l) => l.link_enabled)).toBe(true);

    const after = await versions();
    expect(after.map((v) => v.version)).toEqual([5, 4, 3, 2, 1]);
    // AC-41: every earlier snapshot is byte-for-byte what it was.
    expect(after.slice(1)).toEqual(before);
    expect(after[0]!.config).toMatchObject({ system_prompt: 'Prompt two.', model: 'gpt-4.1', skills: [b.id, a.id] });
    await app.close();
  });

  it('AC-41: stored suite runs of the agent are unchanged by a promote', async () => {
    const { app, agentId } = await setup();
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'Prompt two.' } });
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [run] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId: ws!.id, agentId, agentVersion: 2, status: 'done', casesTotal: 1, effectivePrompt: 'Prompt two.', model: 'gpt-4o-mini', provider: 'openai', recall: 0.5 })
      .returning();
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/1/promote` });
    expect(res.statusCode).toBe(200);
    const [still] = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, run!.id));
    expect(still).toEqual(run);
    await app.close();
  });

  it('Q1: promoting the current version is allowed and creates a duplicate-config version', async () => {
    const { app, agentId, versions } = await setup();
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/1/promote` });
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(2);
    expect((await versions()).map((v) => v.version)).toEqual([2, 1]);
    await app.close();
  });

  it('EC-25: a version with no snapshot is a 409 and nothing changes', async () => {
    const { app } = await setup();
    const [seeded] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.name, 'Security Reviewer'));
    expect(seeded).toBeDefined();
    const snaps = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, seeded!.id));
    expect(snaps).toHaveLength(0);

    const res = await app.inject({ method: 'POST', url: `/agents/${seeded!.id}/versions/${seeded!.version}/promote` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/no saved configuration/);
    const [again] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, seeded!.id));
    expect(again).toEqual(seeded);
    await app.close();
  });

  it('EC-25: a skill deleted since the snapshot is a 409 naming it; nothing changes', async () => {
    const { app, agentId, skill, versions } = await setup();
    const s = await skill('gone');
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [s.id] } }); // v2 records the skill
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'later' } }); // v3
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, s.id));
    const before = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    const snapsBefore = await versions();

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/2/promote` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain(s.id);
    expect(res.json().error.details).toEqual({ missing_skill_ids: [s.id] });
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json()).toEqual(before);
    expect(await versions()).toEqual(snapsBefore);
    await app.close();
  });

  it('AC-40/EC-25: a skill deleted after the pre-check (race) is still a 409 naming it; nothing changes', async () => {
    const { app, agentId, skill, versions } = await setup();
    const s = await skill('raced');
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [s.id] } }); // v2 records the skill
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'later' } }); // v3
    const before = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    const snapsBefore = await versions();
    // The service's pre-check sees the skill; it is deleted before the restore transaction runs.
    const spy = vi.spyOn(AgentsRepository.prototype, 'skillIdsInWorkspace').mockImplementationOnce(async () => {
      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, s.id));
      return new Set([s.id]);
    });
    try {
      const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/2/promote` });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toContain(s.id);
      expect(res.json().error.details).toEqual({ missing_skill_ids: [s.id] });
    } finally {
      spy.mockRestore();
    }
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json()).toEqual(before);
    expect(await versions()).toEqual(snapsBefore);
    await app.close();
  });

  it('404s: unknown agent, version above the latest, another workspace; 422 for version 0', async () => {
    const { app, agentId } = await setup();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'POST', url: `/agents/${ghost}/versions/1/promote` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/99/promote` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${agentId}/versions/0/promote` })).statusCode).toBe(422);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'promote-other' }).returning();
    const foreign = await new AgentsRepository(pg.handle.db).insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
    expect((await app.inject({ method: 'POST', url: `/agents/${foreign.id}/versions/1/promote` })).statusCode).toBe(404);
    const snaps = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, foreign.id)).orderBy(asc(t.agentVersions.version));
    expect(snaps).toHaveLength(1);
    await app.close();
  });
});
