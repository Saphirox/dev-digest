/**
 * `GET /pulls/:id/smart-diff` end to end (Testcontainers pg). Plan-verifier
 * noted the response shape is proven only at the build-function level
 * (`test/smart-diff-build.test.ts`), never through the actual route —
 * modelled on `test/risks.it.test.ts`'s route-level pattern. Deterministic,
 * no model call, so no LLM mock override is needed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-route-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 700,
      title: 'Smart Diff route fixture PR',
      author: 'marisa.koch',
      branch: 'feat/route-fixture',
      base: 'main',
      headSha: 'sha-route-1',
      additions: 5,
      deletions: 0,
      filesCount: 5,
      status: 'needs_review',
      body: 'Fixture spanning all five roles.',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/app.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n ctx\n+core change' },
    { prId: pr!.id, path: 'src/app.test.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n ctx\n+test change' },
    { prId: pr!.id, path: 'package.json', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n ctx\n+wiring change' },
    { prId: pr!.id, path: 'README.md', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n ctx\n+docs change' },
    { prId: pr!.id, path: 'dist/main.js', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n ctx\n+boilerplate change' },
  ]);
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('200s with a body that parses as SmartDiff and has all 5 groups, one file classified per role', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);

    const parsed = SmartDiff.parse(res.json());
    expect(parsed.groups).toHaveLength(5);
    expect(parsed.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);

    const filesByRole = Object.fromEntries(parsed.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(filesByRole.core).toEqual(['src/app.ts']);
    expect(filesByRole.tests).toEqual(['src/app.test.ts']);
    expect(filesByRole.wiring).toEqual(['package.json']);
    expect(filesByRole.docs).toEqual(['README.md']);
    expect(filesByRole.boilerplate).toEqual(['dist/main.js']);

    await app.close();
  });

  it('unknown PR id → 404', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });

    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/smart-diff',
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
