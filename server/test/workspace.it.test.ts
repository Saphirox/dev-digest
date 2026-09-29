/**
 * GET /workspace — characterises the current response shape (green today;
 * plan 0013 Step 6 moves this behind a WorkspaceService with no shape change).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /workspace (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns exactly { workspaceId, cloneDir, repos: [...] }, cloned tracks clone_path, and is workspace-scoped', async () => {
    // A second repo, cloned (clone_path set), in the SAME workspace as seed().
    const [cloned] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'cloned-repo',
        fullName: 'acme/cloned-repo',
        clonePath: '/mock/clones/acme/cloned-repo',
      })
      .returning();

    // A repo in a DIFFERENT workspace — must never appear in this response.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Date.now()}` })
      .returning();
    await pg.handle.db.insert(t.repos).values({
      workspaceId: otherWs!.id,
      owner: 'other',
      name: 'foreign-repo',
      fullName: 'other/foreign-repo',
    });

    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.workspaceId).toBe(workspaceId);
    expect(typeof body.cloneDir).toBe('string');
    expect(body.cloneDir.length).toBeGreaterThan(0);

    expect(
      body.repos.some((r: { full_name: string }) => r.full_name === 'other/foreign-repo'),
    ).toBe(false);

    const clonedEntry = body.repos.find(
      (r: { id: string }) => r.id === cloned!.id,
    );
    expect(clonedEntry).toEqual({
      id: cloned!.id,
      full_name: 'acme/cloned-repo',
      clone_path: '/mock/clones/acme/cloned-repo',
      last_polled_at: null,
      cloned: true,
    });

    // The seed repo (acme/payments-api) has no clone_path → cloned: false.
    const [seedRepo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    const seedEntry = body.repos.find((r: { id: string }) => r.id === seedRepo!.id);
    expect(seedEntry.cloned).toBe(false);
    expect(seedEntry.clone_path).toBeNull();

    await app.close();
  });
});
