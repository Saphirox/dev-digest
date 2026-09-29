/**
 * `RepoIntelRepository.replaceRepoSymbols` / `replaceFileSymbols` (plan 0013
 * Step 14/15) — each runs delete-then-insert in ONE `db.transaction`. A
 * mid-way NOT NULL violation (`symbols.path`, `db/schema/context.ts` — see
 * `symbols` table def) must leave the PRIOR symbols/references cache intact,
 * never an emptied-then-partially-refilled one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  RepoIntelRepository,
  type IndexerSymbolRow,
  type IndexerReferenceRow,
} from '../src/modules/repo-intel/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('RepoIntelRepository atomic symbol/reference replace (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: RepoIntelRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    repo = new RepoIntelRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo(): Promise<string> {
    const name = `replace-atomic-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return r!.id;
  }

  function goodSymbol(repoId: string, path: string, name: string): IndexerSymbolRow {
    return {
      repoId,
      path,
      name,
      kind: 'function',
      line: 1,
      endLine: 2,
      exported: true,
      signature: null,
      contentHash: 'h-old',
    };
  }

  it('replaceRepoSymbols: a mid-way NULL-cast path rejects and leaves the prior full cache untouched', async () => {
    const repoId = await newRepo();
    await repo.insertSymbols([goodSymbol(repoId, 'src/old.ts', 'oldFn')]);
    await repo.insertReferences([
      { repoId, fromPath: 'src/old.ts', toSymbol: 'oldFn', line: 1, contentHash: 'h-old' },
    ]);

    const badSymbols: IndexerSymbolRow[] = [
      goodSymbol(repoId, 'src/new-good.ts', 'newGoodFn'),
      // `symbols.path` is NOT NULL — null-cast to force the constraint AFTER a
      // would-be-valid row, proving the whole call rolls back together.
      { ...goodSymbol(repoId, 'src/new-good.ts', 'newBadFn'), path: null as unknown as string },
    ];
    const badRefs: IndexerReferenceRow[] = [];

    await expect(repo.replaceRepoSymbols(repoId, badSymbols, badRefs)).rejects.toThrow();

    const symbols = await repo.getCachedSymbols(repoId);
    expect(symbols.map((s) => ({ path: s.path, name: s.name }))).toEqual([
      { path: 'src/old.ts', name: 'oldFn' },
    ]);
    const refs = await repo.getCachedReferencesTo(repoId, ['oldFn']);
    expect(refs).toHaveLength(1);
  });

  it('replaceFileSymbols: a mid-way NULL-cast path rejects and leaves the prior slice untouched', async () => {
    const repoId = await newRepo();
    await repo.insertSymbols([goodSymbol(repoId, 'src/keep.ts', 'keepFn')]);

    const badSymbols: IndexerSymbolRow[] = [
      goodSymbol(repoId, 'src/keep.ts', 'freshGoodFn'),
      { ...goodSymbol(repoId, 'src/keep.ts', 'freshBadFn'), path: null as unknown as string },
    ];

    await expect(
      repo.replaceFileSymbols(repoId, ['src/keep.ts'], badSymbols, [], []),
    ).rejects.toThrow();

    const symbols = await repo.getCachedSymbolsForFiles(repoId, ['src/keep.ts']);
    expect(symbols.map((s) => s.name)).toEqual(['keepFn']);
  });
});
