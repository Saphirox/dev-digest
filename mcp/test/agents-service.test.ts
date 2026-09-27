/**
 * `AgentsService.listAgents` — thin orchestration over `AgentsStore` +
 * `toAgentItem` (already unit-tested in `agents-helpers.test.ts`). This file
 * covers the service's own contract: it maps every store row and never
 * throws on an empty store (the "no agents configured" case is rendered by
 * `tools.ts`/`messages.ts`, not the service — see `tools.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { AgentsService } from '../src/modules/agents/service.js';
import { FakeAgentsStore, fakeAgent } from './fakes.js';

describe('AgentsService.listAgents', () => {
  it('maps every store row to an AgentItem, preserving order', async () => {
    const store = new FakeAgentsStore([
      fakeAgent({ id: 'a1', name: 'Reviewer' }),
      fakeAgent({ id: 'a2', name: 'Security Bot' }),
    ]);
    const service = new AgentsService({ store });

    const result = await service.listAgents();
    expect(result.agents.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(result.agents.every((a) => !('systemPrompt' in a))).toBe(true);
  });

  it('returns an empty list, not an error, when no agents are configured', async () => {
    const service = new AgentsService({ store: new FakeAgentsStore([]) });

    const result = await service.listAgents();
    expect(result).toEqual({ agents: [] });
  });
});
