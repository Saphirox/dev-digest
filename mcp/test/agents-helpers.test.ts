import { describe, expect, it } from 'vitest';
import { toAgentItem } from '../src/modules/agents/helpers.js';
import { fakeAgent } from './fakes.js';

describe('toAgentItem', () => {
  it('never returns the system prompt (not part of AgentRecord)', () => {
    const item = toAgentItem(fakeAgent());
    expect(item).not.toHaveProperty('systemPrompt');
  });

  it('truncates a long description to 80 chars', () => {
    const item = toAgentItem(fakeAgent({ description: 'x'.repeat(200) }));
    expect(item.description.length).toBeLessThanOrEqual(80);
  });

  it('keeps id/name/model/enabled as-is', () => {
    const item = toAgentItem(fakeAgent({ id: 'a1', name: 'Reviewer', model: 'gpt-5', enabled: false }));
    expect(item).toMatchObject({ id: 'a1', name: 'Reviewer', model: 'gpt-5', enabled: false });
  });
});
