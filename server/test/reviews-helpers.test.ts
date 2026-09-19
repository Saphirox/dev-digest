import { describe, it, expect } from 'vitest';
import { taskLine, toSkillPromptBlock } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('toSkillPromptBlock', () => {
  it('heads the body with the skill name and trims it', () => {
    expect(toSkillPromptBlock({ name: 'semver', body: '\nBump major on breaks.\n\n' })).toBe(
      '### semver\nBump major on breaks.',
    );
  });
});
