import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type {
  FullSymbolRow,
  RepoBasics,
  ResolvedCallerRow,
} from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * T1.4 — Facade degraded contract (acceptance #10).
 *
 * When `repoIntelEnabled=false` (opt-out; the default is now ON), every facade
 * method MUST return a safe degraded value WITHOUT throwing. Consumers (run-executor,
 * blast, hooks) downgrade to their pre-T1.3 behavior on these returns; if any
 * method threw or returned malformed shape, every consumer would crash.
 *
 * No Postgres, no clone. The service's `repo` (RepoIntelRepository) is patched
 * to return null/[] so we exercise the degraded paths cleanly.
 */

function buildDegradedService(opts: {
  flag: boolean;
  basics?: RepoBasics | null;
  indexStateRow?: IndexState | null;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    // codeIndex is reached by getBlastRadius; we stub minimal behaviour.
    codeIndex: {
      symbols: async () => [],
      references: async () => [],
    } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => opts.basics ?? null,
    tryGetIndexState: async () => opts.indexStateRow ?? null,
    getCachedSymbols: async () => [],
    getCachedSymbolsForFiles: async () => [],
    getCachedReferencesTo: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — degraded contract (flag off)', () => {
  it('getUnresolvedReferences → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures → [] when repoIntelEnabled=false', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getBlastRadius → degraded-but-valid shape (never throws)', async () => {
    const svc = buildDegradedService({ flag: false, basics: null });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    // Shape (every key present, arrays where arrays go) — consumers assume this.
    expect(Array.isArray(blast.changedSymbols)).toBe(true);
    expect(Array.isArray(blast.callers)).toBe(true);
    expect(Array.isArray(blast.impactedEndpoints)).toBe(true);
    expect(blast.degraded).toBe(true);
    // reason is one of the documented DegradedReason values
    expect(['flag_off', 'no_data', 'index_failed', 'index_partial', 'repo_too_large'])
      .toContain(blast.reason);
  });

  it('getIndexState → degraded row (never throws) when no row exists', async () => {
    const svc = buildDegradedService({ flag: false, indexStateRow: null });
    const state = await svc.getIndexState('r1');
    // Always-present fields the UI / dashboard rely on (client bind).
    expect(state.repoId).toBe('r1');
    expect(state.status).toBe('degraded');
    expect(state.filesIndexed).toBe(0);
    expect(state.filesSkipped).toBe(0);
    expect(state.lastIndexedSha).toBe(''); // empty string, not undefined — JSON-safe
    expect(state.indexerVersion).toBeGreaterThanOrEqual(1);
    expect(state.updatedAt instanceof Date).toBe(true);
    expect(state.degraded).toBe(true);
  });

  it('getRepoMap → degraded ({ text:"", tokens:0, cached:false, degraded:true })', async () => {
    const svc = buildDegradedService({ flag: false });
    const map = await svc.getRepoMap('r1');
    expect(map.text).toBe('');
    expect(map.tokens).toBe(0);
    expect(map.cached).toBe(false);
    expect(map.degraded).toBe(true);
  });

  it('getFileRank / getSymbolsInFiles / getConventionSamples / getTopFilesByRank / getCriticalPaths → []', async () => {
    const svc = buildDegradedService({ flag: false });
    await expect(svc.getFileRank('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getSymbolsInFiles('r1', ['a.ts'])).resolves.toEqual([]);
    await expect(svc.getConventionSamples('r1', 12)).resolves.toEqual([]);
    await expect(svc.getTopFilesByRank('r1', 7)).resolves.toEqual([]);
    await expect(svc.getCriticalPaths('r1')).resolves.toEqual([]);
  });

  it('indexRepo / refreshIndex → degraded T1 skeleton (never throws)', async () => {
    const svc = buildDegradedService({ flag: false });
    const a = await svc.indexRepo('r1');
    const b = await svc.refreshIndex('r1');
    expect(a.status).toBe('degraded');
    expect(b.status).toBe('degraded');
    expect(a.filesIndexed).toBe(0);
    expect(b.filesIndexed).toBe(0);
  });
});

describe('RepoIntel facade — degraded contract (flag on, but no data)', () => {
  it('getCallerSignatures with no clone → [] (graceful degrade, no throw)', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getUnresolvedReferences with no clone → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: null } });
    await expect(svc.getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures with empty changedFiles → []', async () => {
    const svc = buildDegradedService({ flag: true, basics: { id: 'r1', owner: 'a', name: 'b', clonePath: '/tmp' } });
    await expect(svc.getCallerSignatures('r1', [])).resolves.toEqual([]);
  });

  it('getBlastRadius: flag off gives exactly flag_off (no clone/codeIndex touched)', async () => {
    const svc = buildDegradedService({ flag: false });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('flag_off');
  });
});

/**
 * T4 (Blast Radius, Step 4) — persistent-index `getBlastRadius` behaviour:
 * partial/failed status pass-through, per-symbol caller cap, and same-file
 * caller exclusion. `state.status` drives `tryPersistentBlast`; a `partial`
 * state still returns data, tagged `degraded:true, reason:'index_partial'`.
 */
function buildPersistentService(opts: {
  status: IndexState['status'];
  symbolRows: FullSymbolRow[];
  callerRows: ResolvedCallerRow[];
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never;
  const svc = new RepoIntelService(container);
  const state: IndexState = {
    repoId: 'r1',
    status: opts.status,
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'sha1',
    indexerVersion: 2,
    updatedAt: new Date(),
  };
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => null,
    tryGetIndexState: async () => state,
    getSymbolRows: async (_repoId: string, paths: string[]) =>
      opts.symbolRows.filter((s) => paths.includes(s.path)),
    getResolvedCallers: async () => opts.callerRows,
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — getBlastRadius (persistent index)', () => {
  const changedSymbol: FullSymbolRow = {
    path: 'a.ts',
    name: 'rateLimit',
    kind: 'function',
    line: 1,
    endLine: 5,
    exported: true,
    signature: null,
  };

  it('partial index status: degraded:true, reason:index_partial, callers present', async () => {
    const svc = buildPersistentService({
      status: 'partial',
      symbolRows: [changedSymbol],
      callerRows: [{ fromPath: 'b.ts', toSymbol: 'rateLimit', line: 10, rank: 5 }],
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(blast.callers).toHaveLength(1);
    expect(blast.callers[0]!.file).toBe('b.ts');
  });

  it('full index status with no changed symbols: not degraded', async () => {
    const svc = buildPersistentService({ status: 'full', symbolRows: [], callerRows: [] });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBeFalsy();
    expect(blast.reason).toBeUndefined();
  });

  it('failed index status falls back to ripgrep path with reason:index_failed', async () => {
    const svc = buildPersistentService({ status: 'failed', symbolRows: [], callerRows: [] });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_failed');
  });

  it('caps callers PER SYMBOL: 25 callers on each of 2 symbols gives 20 each', async () => {
    const symbolRows: FullSymbolRow[] = [
      changedSymbol,
      { path: 'a2.ts', name: 'otherFn', kind: 'function', line: 1, endLine: 5, exported: true, signature: null },
    ];
    const callerRows: ResolvedCallerRow[] = [];
    for (let i = 0; i < 25; i++) {
      callerRows.push({ fromPath: `caller-rateLimit-${i}.ts`, toSymbol: 'rateLimit', line: i + 1, rank: i });
      callerRows.push({ fromPath: `caller-otherFn-${i}.ts`, toSymbol: 'otherFn', line: i + 1, rank: i });
    }
    const svc = buildPersistentService({ status: 'full', symbolRows, callerRows });
    const blast = await svc.getBlastRadius('r1', ['a.ts', 'a2.ts']);
    const byViaSymbol = new Map<string, number>();
    for (const c of blast.callers) {
      byViaSymbol.set(c.viaSymbol, (byViaSymbol.get(c.viaSymbol) ?? 0) + 1);
    }
    expect(byViaSymbol.get('rateLimit')).toBe(20);
    expect(byViaSymbol.get('otherFn')).toBe(20);
  });

  it('excludes a caller reference sitting in the changed symbol\'s own declaring file', async () => {
    const svc = buildPersistentService({
      status: 'full',
      symbolRows: [changedSymbol],
      callerRows: [
        { fromPath: 'a.ts', toSymbol: 'rateLimit', line: 3, rank: 9 }, // self-file — excluded
        { fromPath: 'b.ts', toSymbol: 'rateLimit', line: 10, rank: 5 }, // real caller
      ],
    });
    const blast = await svc.getBlastRadius('r1', ['a.ts']);
    expect(blast.callers).toHaveLength(1);
    expect(blast.callers[0]!.file).toBe('b.ts');
  });
});
