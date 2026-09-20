/**
 * Conventions extractor over HTTP against real Postgres (migrations 0013/0014
 * applied to a clean DB): grounding, dedupe, re-scan semantics, tenancy, the
 * skill draft, and the 422 when nothing can be sampled. The model and the
 * clone are mocks; repo-intel isn't indexed, so only config files are sampled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockCodeIndex, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const FILES = {
  'package.json': '{\n  "name": "payments-api",\n  "type": "module"\n}',
  'AGENTS.md': '# Rules\n\nAlways use async/await, never .then() chains.\nErrors go through AppError.',
};

const EXTRACTION = {
  candidates: [
    {
      rule: 'Always use async/await instead of .then() chains',
      rationale: 'Stated in AGENTS.md.',
      evidence_path: 'AGENTS.md',
      evidence_line: 99, // wrong on purpose: corrected to the real line
      evidence_snippet: 'Always use async/await, never .then() chains.',
      pattern: 'await ',
      category: 'general',
      confidence: 0.9,
    },
    {
      rule: 'Packages are ES modules',
      rationale: null,
      evidence_path: './package.json',
      evidence_line: 3,
      evidence_snippet: '"type": "module"',
      pattern: null,
      category: 'structure',
      confidence: 0.8,
    },
    {
      rule: 'Use Redis singleton',
      rationale: null,
      evidence_path: 'src/lib/redis.ts', // never sampled
      evidence_line: 1,
      evidence_snippet: 'export const redis = new Redis(url);',
      pattern: null,
      category: 'structure',
      confidence: 0.85,
    },
    {
      rule: 'always use async/await instead of .then() chains!', // duplicate of #1
      rationale: null,
      evidence_path: 'AGENTS.md',
      evidence_line: 3,
      evidence_snippet: 'Always use async/await, never .then() chains.',
      pattern: null,
      category: 'general',
      confidence: 0.7,
    },
  ],
};

d('conventions', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(files: Record<string, string> = FILES) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files }),
        github: new MockGitHubClient(),
        codeIndex: new MockCodeIndex(), // one matching file per pattern
        llm: { openrouter: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } }) },
      },
    });
  }

  async function newRepo() {
    const name = `conv-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!.id;
  }

  it('keeps grounded candidates, fixes line numbers, drops ungrounded and duplicates', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ proposed: 2, dropped_ungrounded: 1, dropped_duplicate: 1, sampled_files: 2 });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(list.sampled_files).toBe(2);
    expect(typeof list.last_scan_at).toBe('string');
    const asyncRule = list.conventions.find((c: { rule: string }) => c.rule.startsWith('Always'));
    expect(asyncRule).toMatchObject({
      evidence_path: 'AGENTS.md',
      evidence_line: 3,
      evidence_line_end: 3,
      evidence_snippet: 'Always use async/await, never .then() chains.',
      status: 'pending',
      occurrences: 1, // MockCodeIndex returns one file
      confidence: 0.63, // 0.9 × single-file penalty
    });
    const esm = list.conventions.find((c: { rule: string }) => c.rule === 'Packages are ES modules');
    expect(esm.evidence_path).toBe('package.json');
    await app.close();
  });

  it('a re-scan replaces only pending rows: accepted and rejected rules stay and never return', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [a, b] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json().conventions;
    await app.inject({ method: 'PATCH', url: `/conventions/${a.id}`, payload: { status: 'accepted' } });
    await app.inject({ method: 'PATCH', url: `/conventions/${b.id}`, payload: { status: 'rejected' } });

    const again = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json();
    expect(again).toMatchObject({ proposed: 0, dropped_duplicate: 3 });
    const statuses = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` }))
      .json()
      .conventions.map((c: { status: string }) => c.status)
      .sort();
    expect(statuses).toEqual(['accepted', 'rejected']);
    await app.close();
  });

  it('edits a rule and builds a skill draft from the accepted ones', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const noneAccepted = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` });
    expect(noneAccepted.statusCode).toBe(422);

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [c] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json().conventions;
    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${c.id}`,
      payload: { rule: 'Edited rule text', status: 'accepted' },
    });
    expect(edited.json()).toMatchObject({ rule: 'Edited rule text', status: 'accepted' });

    const draft = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` })).json();
    expect(draft).toMatchObject({ type: 'convention', convention_count: 1 });
    expect(draft.name).toBe('repo-conventions');
    expect(draft.body).toContain('Edited rule text');
    await app.close();
  });

  it('returns 422 when nothing in the repo can be sampled', async () => {
    const app = await makeApp({});
    const repoId = await newRepo();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('scopes every route to the workspace', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const [c] = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json().conventions;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    await pg.handle.db.update(t.conventions).set({ workspaceId: other!.id });

    expect((await app.inject({ method: 'PATCH', url: `/conventions/${c.id}`, payload: { status: 'accepted' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${c.id}` })).statusCode).toBe(404);
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/repos/${ghost}/conventions` })).statusCode).toBe(404);
    await app.close();
  });
});
