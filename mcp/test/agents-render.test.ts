import { describe, expect, it } from 'vitest';
import { renderAgentLine } from '../src/modules/agents/render.js';

describe('renderAgentLine', () => {
  it('renders ENABLED/DISABLED, name, id, model', () => {
    expect(renderAgentLine({ name: 'Reviewer', id: 'a1', model: 'gpt-5', enabled: true })).toBe(
      'ENABLED  Reviewer (a1, gpt-5)',
    );
    expect(renderAgentLine({ name: 'Reviewer', id: 'a1', model: 'gpt-5', enabled: false })).toBe(
      'DISABLED Reviewer (a1, gpt-5)',
    );
  });
});
