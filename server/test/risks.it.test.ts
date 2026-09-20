/**
 * Risk Areas — `GET /pulls/:id/risks` end to end (Testcontainers pg).
 * Modelled on `test/intent.it.test.ts`: no unit test exercises the route or
 * `ReviewService.getRisks` before this file (plan-verifier finding on
 * `docs/plans/0003-intent-card-risk-areas.md`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// A real new dependency (ioredis) plus an auth-path change — exercises two
// detectors so the grounding assertion below has something to check.
const RAW_DIFF = [
  'diff --git a/package.json b/package.json',
  '--- a/package.json',
  '+++ b/package.json',
  '@@ -10,4 +10,5 @@',
  '  "dependencies": {',
  '    "express": "^4.18.0",',
  '+    "ioredis": "^5.4.1",',
  '    "lodash": "^4.17.21"',
  '  }',
  'diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts',
  '--- a/src/middleware/ratelimit.ts',
  '+++ b/src/middleware/ratelimit.ts',
  '@@ -1,2 +1,4 @@',
  ' export function rateLimiter(req, res, next) {',
  "+  const token = req.headers['x-api-token'];",
  '+  if (!token) return res.status(401).end();',
  ' }',
].join('\n');

// A diff that trips none of the three detectors.
const UNINTERESTING_DIFF = [
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,1 +1,2 @@',
  ' # devdigest',
  '+Now with more docs.',
].join('\n');

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, headSha: string) {
  const name = `risks-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 512,
      title: 'Add rate limiting + a cache dependency',
      author: 'marisa.koch',
      branch: 'feat/rl-cache',
      base: 'main',
      headSha,
      additions: 3,
      deletions: 0,
      filesCount: 2,
      status: 'needs_review',
      body: 'Adds ioredis and a rate-limit auth check.',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('Risk Areas — GET /pulls/:id/risks (Testcontainers pg)', () => {
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

  it('200s with derived_for_sha === pull.headSha, and every ref matches parseUnifiedDiff(RAW_DIFF)', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: RAW_DIFF }) },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'sha-risks-1');

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/risks` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.pr_id).toBe(pr.id);
    expect(body.derived_for_sha).toBe(pr.headSha);
    expect(body.scanned).toMatchObject({ files: 2 });

    const kinds = body.risks.map((r: { kind: string }) => r.kind).sort();
    expect(kinds).toEqual(['auth_surface', 'new_dependency']);

    const depRisk = body.risks.find((r: { kind: string }) => r.kind === 'new_dependency');
    expect(depRisk.title).toBe('New dependency: ioredis');

    const diff = parseUnifiedDiff(RAW_DIFF);
    const linesByFile = new Map<string, Set<number>>();
    for (const f of diff.files) {
      const set = new Set<number>();
      for (const h of f.hunks) for (const n of h.newLineNumbers) set.add(n);
      linesByFile.set(f.path, set);
    }
    for (const risk of body.risks) {
      for (const ref of risk.refs) {
        const lines = linesByFile.get(ref.file);
        expect(lines).toBeDefined();
        expect(lines!.has(ref.start_line)).toBe(true);
        expect(lines!.has(ref.end_line)).toBe(true);
      }
    }

    await app.close();
  });

  it('an uninteresting diff → risks: []', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: UNINTERESTING_DIFF }) },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'sha-risks-2');

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/risks` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ risks: [] });

    await app.close();
  });

  it('unknown PR id → 404', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: RAW_DIFF }) },
    });

    const res = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-0000-0000-000000000000/risks' });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
