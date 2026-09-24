/**
 * `classifyFile` — pure path+size classifier for Smart Diff
 * (`docs/plans/0004-smart-diff.md` step 2). The rule ORDER is the contract
 * under test: lock-file basename beats size (the acceptance criterion —
 * lock files are `boilerplate` regardless of size), generated paths beat
 * size, size beats wiring path, and only what's left is `core`.
 */
import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import {
  LOCK_BASENAMES,
  BOILERPLATE_MIN_CHANGED_LINES,
  WIRING_MAX_CHANGED_LINES,
} from '../src/modules/reviews/smart-diff/constants.js';

describe('classifyFile — lock files are boilerplate regardless of size', () => {
  for (const base of LOCK_BASENAMES) {
    it(`${base} at 1 changed line`, () => {
      expect(classifyFile(base, 1, 0)).toBe('boilerplate');
    });
    it(`${base} at 10,000 changed lines`, () => {
      expect(classifyFile(base, 5000, 5000)).toBe('boilerplate');
    });
  }

  it('a lock file nested inside src/ is still boilerplate — the basename rule fires before any path rule', () => {
    // `src/` matches no generated/wiring path segment on its own, so this only
    // passes if LOCK_BASENAMES is checked first, exactly as the implementation
    // orders it.
    expect(classifyFile('src/lib/package-lock.json', 1, 0)).toBe('boilerplate');
  });
});

describe('classifyFile — generated paths/extensions are boilerplate', () => {
  it('dist/ path segment', () => {
    expect(classifyFile('dist/main.js', 10, 0)).toBe('boilerplate');
  });
  it('*.min.js extension', () => {
    expect(classifyFile('public/app.min.js', 10, 0)).toBe('boilerplate');
  });
  it('__snapshots__/ path segment', () => {
    expect(classifyFile('src/__snapshots__/Foo.test.tsx.snap', 10, 0)).toBe('boilerplate');
  });
  it('vendor/ path segment', () => {
    expect(classifyFile('vendor/lib.js', 10, 0)).toBe('boilerplate');
  });
});

describe('classifyFile — markdown is wiring, not core', () => {
  it('CLAUDE.md (root-level doc, via WIRING_FILE_RE, not the basename list)', () => {
    expect(classifyFile('CLAUDE.md', 50, 50)).toBe('wiring');
  });
  it('INSIGHTS.md nested under a module', () => {
    expect(classifyFile('server/INSIGHTS.md', 50, 50)).toBe('wiring');
  });
});

describe('classifyFile — wiring paths/basenames', () => {
  it('src/config.ts', () => {
    expect(classifyFile('src/config.ts', 50, 0)).toBe('wiring');
  });
  it('a routes.ts file', () => {
    expect(classifyFile('src/modules/reviews/routes.ts', 50, 0)).toBe('wiring');
  });
  it('package.json (basename, any directory)', () => {
    expect(classifyFile('package.json', 50, 0)).toBe('wiring');
  });
});

describe('classifyFile — size boundaries', () => {
  it(`a ${WIRING_MAX_CHANGED_LINES}-line edit to a core-looking file is wiring (exactly at the boundary)`, () => {
    expect(classifyFile('src/modules/reviews/service.ts', 3, 3)).toBe('wiring');
  });
  it(`${WIRING_MAX_CHANGED_LINES + 1} changed lines on the same path is core, not wiring`, () => {
    expect(classifyFile('src/modules/reviews/service.ts', 4, 3)).toBe('core');
  });
  it('a 120-line change to src/modules/reviews/service.ts is core', () => {
    expect(classifyFile('src/modules/reviews/service.ts', 60, 60)).toBe('core');
  });
  it(`exactly ${BOILERPLATE_MIN_CHANGED_LINES} changed lines on a core-looking file flips it to boilerplate`, () => {
    expect(classifyFile('src/modules/reviews/service.ts', 400, 400)).toBe('boilerplate');
  });
  it(`${BOILERPLATE_MIN_CHANGED_LINES - 1} changed lines stays core (just under the boilerplate cap)`, () => {
    expect(classifyFile('src/modules/reviews/service.ts', 400, 399)).toBe('core');
  });
});

describe('classifyFile — tests are boilerplate regardless of size', () => {
  // Real paths from the dev DB's pr_files, not invented ones.
  it.each([
    'client/src/lib/format-usd.test.ts',
    'client/src/components/run-cost-badge/RunCostBadge.test.tsx',
    'server/test/rate-limit.test.ts',
    'server/test/smart-diff.it.test.ts',
    'src/foo.spec.ts',
    'src/__tests__/bar.ts',
    'e2e/specs/05-pr-diff.flow.json',
  ])('%s → boilerplate', (path) => {
    expect(classifyFile(path, 120, 0)).toBe('boilerplate');
  });

  it('a tiny test edit is still boilerplate — it must not fall through to wiring via the size rule', () => {
    expect(classifyFile('client/src/lib/api.test.ts', 2, 1)).toBe('boilerplate');
  });

  it('docs that merely live in a test directory stay wiring, not boilerplate', () => {
    expect(classifyFile('e2e/CLAUDE.md', 10, 0)).toBe('wiring');
    expect(classifyFile('e2e/INSIGHTS.md', 10, 0)).toBe('wiring');
  });

  it.each(['src/latest/foo.ts', 'src/contest.ts', 'src/attestation.ts', 'src/lib/testing-utils.ts'])(
    'does not catch look-alikes: %s stays core',
    (path) => {
      expect(classifyFile(path, 50, 0)).toBe('core');
    },
  );
});
