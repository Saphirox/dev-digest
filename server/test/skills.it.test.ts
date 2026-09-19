/**
 * SkillsRepository against real Postgres (a clean testcontainer, so migration
 * 0012 is exercised from scratch): workspace scoping, version snapshots,
 * "used by" counts and the cascade from skills to agent links.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

d('SkillsRepository', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let agentId: string;
  let repo: SkillsRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other' })
      .returning();
    otherWorkspaceId = other!.id;
    const [agent] = await pg.handle.db.select().from(t.agents);
    agentId = agent!.id;
    repo = new SkillsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const newSkill = () =>
    repo.insert(workspaceId, {
      name: `skill-${seq++}`,
      description: 'Use when…',
      type: 'rubric',
      source: 'manual',
      body: 'v1 body',
      enabled: true,
    });

  it('snapshots version 1 on insert and a new version on a bumped update', async () => {
    const s = await newSkill();
    await repo.update(workspaceId, s.id, { body: 'v2 body' }, 2);
    await repo.update(workspaceId, s.id, { enabled: false });
    const versions = await repo.listVersions(s.id);
    expect(versions.map((v) => [v.version, v.body])).toEqual([
      [2, 'v2 body'],
      [1, 'v1 body'],
    ]);
    expect(await repo.get(workspaceId, s.id)).toMatchObject({ version: 2, enabled: false });
  });

  it('scopes every lookup to the workspace', async () => {
    const s = await newSkill();
    expect(await repo.get(otherWorkspaceId, s.id)).toBeUndefined();
    expect(await repo.update(otherWorkspaceId, s.id, { body: 'x' })).toBeUndefined();
    expect(await repo.delete(otherWorkspaceId, s.id)).toBe(false);
    expect((await repo.list(otherWorkspaceId)).map((r) => r.id)).not.toContain(s.id);
  });

  it('counts the agents that link a skill and cascades links on delete', async () => {
    const s = await newSkill();
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId: s.id, order: 0 });
    const row = (await repo.list(workspaceId)).find((r) => r.id === s.id);
    expect(row?.usedBy).toBe(1);
    expect((await repo.usedBy(workspaceId, s.id)).map((a) => a.id)).toEqual([agentId]);

    // A disabled link keeps the skill in the agent's list but doesn't count as use.
    await pg.handle.db.update(t.agentSkills).set({ enabled: false });
    expect((await repo.list(workspaceId)).find((r) => r.id === s.id)?.usedBy).toBe(0);
    expect(await repo.usedBy(workspaceId, s.id)).toEqual([]);

    expect(await repo.delete(workspaceId, s.id)).toBe(true);
    const links = await pg.handle.db.select().from(t.agentSkills);
    expect(links.find((l) => l.skillId === s.id)).toBeUndefined();
  });

  it('rejects a type outside the CHECK constraint', async () => {
    await expect(
      pg.handle.db.insert(t.skills).values({
        workspaceId,
        name: 'bad',
        description: '',
        type: 'magic' as 'custom',
        source: 'manual',
        body: 'b',
      }),
    ).rejects.toThrow();
  });
});
