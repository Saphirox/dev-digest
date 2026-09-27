import { describe, expect, it } from 'vitest';
import { renderConventionLine } from '../src/modules/conventions/render.js';

describe('renderConventionLine', () => {
  it('renders one line per convention, evidence already combined as path:line', () => {
    const line = renderConventionLine({
      rule: 'Use kebab-case for files',
      category: 'naming',
      status: 'accepted',
      evidence: 'src/foo.ts:12',
    });
    expect(line).toBe('[accepted] (naming) Use kebab-case for files — src/foo.ts:12');
  });
});
