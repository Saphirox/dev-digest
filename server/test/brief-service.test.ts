import { describe, it, expect } from 'vitest';
import type { PrBrief } from '@devdigest/shared';
import { BriefService } from '../src/modules/brief/service.js';
import type {
  BriefBlastIndex,
  BriefFile,
  BriefIntent,
  BriefModel,
  BriefPull,
  BriefStore,
  IssueSource,
  SpecDocsSource,
} from '../src/modules/brief/ports.js';
import type { BriefModelOutput } from '../src/modules/brief/output.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import { ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';

const PULL: BriefPull = { id: 'pr1', repoId: 'r1', number: 5, title: 'Add limiter', body: 'Fixes #77', headSha: 'sha-head' };
const FILES: BriefFile[] = [
  { path: 'src/config.ts', additions: 4, deletions: 0 },
  { path: 'src/middleware/ratelimit.ts', additions: 20, deletions: 1 },
];

const OLD_BRIEF: PrBrief = {
  summary: 'old',
  risks: [],
  review_focus: [],
  generated_for_sha: 'sha-old',
  generated_at: '2026-01-01T00:00:00.000Z',
  missing_inputs: [],
  cost_usd: null,
  tokens_in: null,
  tokens_out: null,
};

class FakeStore implements BriefStore {
  brief: PrBrief | null = null;
  upserts = 0;
  intent: BriefIntent | undefined = { intent: 'limit', inScope: [], outOfScope: [] };
  async findPull(_ws: string, prId: string) {
    return prId === PULL.id ? PULL : undefined;
  }
  async findRepo() {
    return { id: 'r1', owner: 'o', name: 'n' };
  }
  async listFiles() {
    return FILES;
  }
  async getIntent() {
    return this.intent;
  }
  async getBrief() {
    return this.brief;
  }
  async upsertBrief(_prId: string, brief: PrBrief) {
    this.upserts++;
    this.brief = brief;
  }
}

const BLAST_OK: BlastResult = {
  changedSymbols: [{ name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' }],
  callers: [{ symbol: 'boot', file: 'src/server.ts', line: 88, viaSymbol: 'rateLimit', rank: 1 }],
  degraded: false,
} as unknown as BlastResult;

const BLAST_NO_DATA = { changedSymbols: [], callers: [], degraded: true, reason: 'no_data' } as unknown as BlastResult;

const ISSUE_OK: IssueSource = {
  resolve: async () => ({ getIssue: async () => ({ number: 77, title: 'Rate limit', body: 'please', state: 'open' }) }),
};

const OUTPUT: BriefModelOutput = {
  summary: 'Adds a limiter.',
  risks: [
    {
      kind: 'x',
      title: 'Grounded',
      explanation: 'e',
      severity: 'high',
      file_refs: [{ file: 'src/config.ts', start_line: 12, end_line: null }],
    },
    {
      kind: 'x',
      title: 'Ungrounded',
      explanation: 'e',
      severity: 'low',
      file_refs: [{ file: 'src/lib/redis-pool.ts', start_line: null, end_line: null }],
    },
  ],
  review_focus: [{ file: './src/server.ts', line: 88, reason: 'wraps bootstrap' }],
};

/** A `SpecDocsSource` over fixed agents / skills; records the `loadDocs` input. */
function fakeSpecs(
  over: {
    agents?: { id: string; contextPaths: string[] }[];
    skills?: Record<string, string[][]>;
    docs?: { path: string; content: string }[];
    loaded?: { agentPaths: string[]; skillPaths: string[][] }[];
  } = {},
): SpecDocsSource {
  return {
    listEnabledAgents: async () => over.agents ?? [],
    skillPaths: async (agentId) => over.skills?.[agentId] ?? [],
    loadDocs: async ({ agentPaths, skillPaths }) => {
      over.loaded?.push({ agentPaths, skillPaths });
      return over.docs ?? [];
    },
  };
}

function setup(over: {
  store?: FakeStore;
  index?: BriefBlastIndex;
  issues?: IssueSource;
  specs?: SpecDocsSource;
  generate?: BriefModel['generate'];
} = {}) {
  const store = over.store ?? new FakeStore();
  const calls: { messages: { role: string; content: string }[] }[] = [];
  const model: BriefModel = {
    generate:
      over.generate ??
      (async (_ws, messages) => {
        calls.push({ messages });
        return { data: OUTPUT, model: 'm', provider: 'openai', costUsd: 0.01, tokensIn: 100, tokensOut: 20 };
      }),
  };
  const service = new BriefService({
    store,
    index: over.index ?? { getBlastRadius: async () => BLAST_OK, getIndexedSha: async () => 'idx' },
    issues: over.issues ?? ISSUE_OK,
    specs: over.specs ?? fakeSpecs(),
    model,
  });
  return { store, service, calls };
}

describe('BriefService.get', () => {
  it('AC-2: returns null when nothing is stored, without a model call', async () => {
    const { service, calls } = setup();
    expect(await service.get('w', 'pr1')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns the stored brief and 404s an unknown PR', async () => {
    const store = new FakeStore();
    store.brief = OLD_BRIEF;
    const { service } = setup({ store });
    expect(await service.get('w', 'pr1')).toEqual(OLD_BRIEF);
    await expect(service.get('w', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('BriefService.generate', () => {
  it('AC-3, AC-9, AC-10: makes one call, validates, and stores the brief with the head SHA', async () => {
    const { service, store, calls } = setup();
    const brief = await service.generate('w', 'pr1');
    expect(calls).toHaveLength(1);
    expect(brief).toMatchObject({
      summary: 'Adds a limiter.',
      generated_for_sha: 'sha-head',
      missing_inputs: [],
      cost_usd: 0.01,
      tokens_in: 100,
      tokens_out: 20,
    });
    expect(brief.risks.map((r) => r.title)).toEqual(['Grounded']);
    expect(brief.review_focus).toEqual([{ file: 'src/server.ts', line: 88, reason: 'wraps bootstrap' }]);
    expect(store.upserts).toBe(1);
    expect(store.brief).toEqual(brief);
  });

  it('AC-4: the model input names the files and blast callers and carries no patch text', async () => {
    const { service, calls } = setup();
    await service.generate('w', 'pr1');
    const user = calls[0]?.messages[1]?.content ?? '';
    expect(user).toContain('src/config.ts +4 -0');
    expect(user).toContain('src/server.ts');
    expect(user).toContain('#77 Rate limit');
  });

  it('EC-5: a failing model call keeps the stored brief and stores nothing', async () => {
    const store = new FakeStore();
    store.brief = OLD_BRIEF;
    const { service } = setup({
      store,
      generate: async () => {
        throw new Error('provider exploded');
      },
    });
    await expect(service.generate('w', 'pr1')).rejects.toThrow(ExternalServiceError);
    await expect(service.generate('w', 'pr1')).rejects.toThrow('Brief generation failed: provider exploded');
    expect(store.upserts).toBe(0);
    expect(store.brief).toEqual(OLD_BRIEF);
  });

  it('EC-4: an AppError (missing key) propagates as itself', async () => {
    const { service } = setup({
      generate: async () => {
        throw new ConfigError('OPENAI_API_KEY is not configured');
      },
    });
    await expect(service.generate('w', 'pr1')).rejects.toBeInstanceOf(ConfigError);
  });

  it('EC-9: two concurrent generates share one model call, and a later one calls again', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service } = setup({
      generate: async () => {
        calls++;
        await gate;
        return { data: OUTPUT, model: 'm', provider: 'openai', costUsd: null, tokensIn: 1, tokensOut: 1 };
      },
    });
    const a = service.generate('w', 'pr1');
    const b = service.generate('w', 'pr1');
    release();
    const [ba, bb] = await Promise.all([a, b]);
    expect(calls).toBe(1);
    expect(ba).toBe(bb);
    await service.generate('w', 'pr1');
    expect(calls).toBe(2);
  });

  it('EC-10: an issue fetch failure still generates and lists the issue', async () => {
    const { service } = setup({
      issues: {
        resolve: async () => ({
          getIssue: async () => {
            throw new Error('404');
          },
        }),
      },
    });
    const brief = await service.generate('w', 'pr1');
    expect(brief.missing_inputs).toEqual(['issue #77']);
  });

  it('EC-10: a missing GitHub token (resolve throws) counts as an unfetchable issue', async () => {
    const { service } = setup({
      issues: {
        resolve: async () => {
          throw new ConfigError('GITHUB_TOKEN is not configured');
        },
      },
    });
    expect((await service.generate('w', 'pr1')).missing_inputs).toEqual(['issue #77']);
  });

  it('AC-20, EC-1: no intent, a degraded blast and a failing issue are all listed', async () => {
    const store = new FakeStore();
    store.intent = undefined;
    const { service } = setup({
      store,
      index: { getBlastRadius: async () => BLAST_NO_DATA, getIndexedSha: async () => null },
      issues: {
        resolve: async () => ({
          getIssue: async () => {
            throw new Error('404');
          },
        }),
      },
    });
    const brief = await service.generate('w', 'pr1');
    expect(brief.missing_inputs).toEqual(['intent', 'blast radius (no_data)', 'issue #77']);
    expect(brief.summary).toBe('Adds a limiter.');
  });

  it('a throwing blast index and spec loader degrade instead of failing', async () => {
    const { service } = setup({
      index: {
        getBlastRadius: async () => {
          throw new Error('index down');
        },
        getIndexedSha: async () => null,
      },
      specs: {
        ...fakeSpecs(),
        loadDocs: async () => {
          throw new Error('no clone');
        },
      },
    });
    const brief = await service.generate('w', 'pr1');
    expect(brief.missing_inputs).toEqual(['blast radius (unavailable)']);
  });

  it('puts spec documents in the model input', async () => {
    const { service, calls } = setup({ specs: fakeSpecs({ docs: [{ path: 'docs/spec.md', content: 'SPEC BODY' }] }) });
    await service.generate('w', 'pr1');
    expect(calls[0]?.messages[1]?.content).toContain('<untrusted source="spec:docs/spec.md">\nSPEC BODY');
  });

  it('D-7: reads the enabled agents\' paths and their enabled skills\' paths in one load', async () => {
    const loaded: { agentPaths: string[]; skillPaths: string[][] }[] = [];
    const { service } = setup({
      specs: fakeSpecs({
        agents: [
          { id: 'a1', contextPaths: ['docs/a.md'] },
          { id: 'a2', contextPaths: ['docs/b.md', 'docs/c.md'] },
        ],
        skills: { a1: [['docs/s1.md'], ['docs/s2.md', 'docs/s3.md']], a2: [] },
        loaded,
      }),
    });
    await service.generate('w', 'pr1');
    expect(loaded).toEqual([
      {
        agentPaths: ['docs/a.md', 'docs/b.md', 'docs/c.md'],
        skillPaths: [['docs/s1.md'], ['docs/s2.md', 'docs/s3.md']],
      },
    ]);
  });

  it('404s an unknown PR before any call', async () => {
    const { service, calls } = setup();
    await expect(service.generate('w', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(0);
  });
});
