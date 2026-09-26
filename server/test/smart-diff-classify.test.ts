/**
 * `classifyFile` — pure PATH-ONLY classifier for Smart Diff
 * (`docs/plans/0009-smart-diff-spec-completion.md` step 1/3). Size
 * thresholds are gone; the rule ORDER is the contract under test: all
 * `SPEC_RULES` (boilerplate → tests → wiring → docs), then all
 * `EXTRA_RULES` (same priority), else `core`.
 */
import { posix } from 'node:path';
import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import { ROLE_ORDER, CLASSIFY_PRIORITY, SPEC_RULES, EXTRA_RULES } from '../src/modules/reviews/smart-diff/constants.js';

describe('classifyFile — path → role table', () => {
  it.each([
    // --- edge cases (spec priority order matters) ---
    ['src/__tests__/__snapshots__/x.snap', 'boilerplate', 'edge 1 (snapshot > tests)'],
    ['.claude/skills/security/SKILL.md', 'wiring', 'edge 2 (.claude/** > docs)'],
    ['e2e/README.md', 'tests', 'edge 3 (e2e/** > docs)'],

    // --- boilerplate: spec lock rules, nested basenames ---
    ['server/pnpm-lock.yaml', 'boilerplate', 'spec lock rule, nested'],
    ['reviewer-core/package-lock.json', 'boilerplate', 'spec lock rule, nested'],
    ['Cargo.lock', 'boilerplate', 'spec *.lock rule'],

    // --- boilerplate: spec generated paths/extensions ---
    ['dist/main.js', 'boilerplate', 'spec dist/**'],
    ['public/app.min.js', 'boilerplate', 'spec *.min.js'],
    ['src/api.generated.ts', 'boilerplate', 'spec *.generated.*'],

    // --- boilerplate: extras (vendor path segment, image extension) ---
    ['server/src/vendor/shared/contracts/brief.ts', 'boilerplate', 'extra vendor path segment'],
    ['assets/logo.png', 'boilerplate', 'extra image extension'],
    // Pinned deliberate outcome: within the EXTRA pass, boilerplate is
    // checked before docs (CLASSIFY_PRIORITY), so an image extension under a
    // `docs/` folder is boilerplate, not docs — the image extra fires before
    // the `docs?` segment extra ever runs. Contrast with `server/docs/diagram.dot`
    // below, a non-image extension, which DOES reach the docs? extra.
    ['server/docs/diagram.png', 'boilerplate', 'extra image extension beats extra docs? segment, pinned'],

    // --- tests: spec ---
    ['server/test/smart-diff-build.test.ts', 'tests', 'spec *.test.ts'],
    ['client/src/components/diff-viewer/FileCard.test.tsx', 'tests', 'spec *.test.tsx'],
    ['server/test/smart-diff.it.test.ts', 'tests', 'spec *.it.test.ts'],
    ['e2e/specs/05-pr-diff.flow.json', 'tests', 'spec e2e/**'],
    ['server/test/helpers/pg.ts', 'tests', 'spec **/test/**'],

    // --- tests: extras ---
    ['src/foo.spec.tsx', 'tests', 'extra TEST_FILE_RE (.spec.tsx)'],
    ['src/__mocks__/api.ts', 'tests', 'extra __mocks__ segment'],
    // Pinned: a capitalized component's `.spec.tsx` colocated test, same
    // extra rule, real client-shaped path.
    ['client/src/components/Foo.spec.tsx', 'tests', 'extra TEST_FILE_RE (.spec.tsx), pinned'],

    // --- wiring: spec ---
    ['client/src/components/diff-viewer/index.ts', 'wiring', 'spec index.ts'],
    ['client/next.config.mjs', 'wiring', 'spec *.config.*'],
    ['server/tsconfig.json', 'wiring', 'spec tsconfig*.json'],
    ['server/.env.example', 'wiring', 'spec .env*'],
    ['docker-compose.yml', 'wiring', 'spec docker-compose*.yml'],
    ['.github/workflows/client.yml', 'wiring', 'spec .github/**'],

    // --- wiring: extras ---
    ['server/src/modules/reviews/routes.ts', 'wiring', 'extra WIRING_PATH_RE (routes)'],
    ['server/src/db/migrations/0011_petite_molecule_man.sql', 'wiring', 'extra WIRING_PATH_RE (migrations)'],
    ['client/messages/en/prReview.json', 'wiring', 'extra WIRING_PATH_RE (messages)'],
    ['client/package.json', 'wiring', 'extra basename package.json'],
    // Pinned deliberate outcomes (not look-alikes): the classifier's OWN
    // source file matches its own "constants" wiring segment, same as any
    // other module's constants.ts.
    ['server/src/modules/reviews/smart-diff/constants.ts', 'wiring', 'extra WIRING_PATH_RE (constants), pinned'],
    ['client/src/lib/types.ts', 'wiring', 'extra WIRING_PATH_RE (types), pinned'],
    ['server/src/db/schema/reviews.ts', 'wiring', 'extra WIRING_PATH_RE (schema), pinned'],

    // --- docs: spec ---
    ['docs/specs/smart-diff.md', 'docs', 'spec docs/**'],
    ['README.md', 'docs', 'spec README*'],
    ['server/INSIGHTS.md', 'docs', 'spec **/*.md'],
    ['CHANGELOG.md', 'docs', 'spec CHANGELOG*'],
    ['LICENSE', 'docs', 'spec LICENSE'],

    // --- docs: extras (moved from wiring — Decision 2) ---
    ['server/docs/diagram.dot', 'docs', 'extra docs? path segment'],
    ['notes.txt', 'docs', 'extra .txt extension'],

    // --- core: fall-through / segment anchoring (no look-alike false hits) ---
    ['server/src/modules/reviews/service.ts', 'core', 'fall-through'],
    ['reviewer-core/src/prompt.ts', 'core', 'fall-through'],
    [
      'client/src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/SmartDiffViewer.tsx',
      'core',
      'fall-through',
    ],
    ['contest.ts', 'core', 'segment anchoring (not a "test" segment)'],
    ['latest/x.ts', 'core', 'segment anchoring (not a "test" segment)'],
  ] as const)('%s → %s (%s)', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('has arity 1 — path only, no size params', () => {
    expect(classifyFile.length).toBe(1);
  });

  it('ROLE_ORDER is the five roles in display order', () => {
    expect(ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });
});

describe('CLASSIFY_PRIORITY is the enforced source of truth for rule precedence', () => {
  it('is boilerplate → tests → wiring → docs', () => {
    expect(CLASSIFY_PRIORITY).toEqual(['boilerplate', 'tests', 'wiring', 'docs']);
  });

  it('SPEC_RULES and EXTRA_RULES both key exactly the CLASSIFY_PRIORITY roles — no missing/extra role bucket', () => {
    const expected = [...CLASSIFY_PRIORITY].sort();
    expect(Object.keys(SPEC_RULES).sort()).toEqual(expected);
    expect(Object.keys(EXTRA_RULES).sort()).toEqual(expected);
  });

  it('a path matching two roles resolves to the earlier role in CLASSIFY_PRIORITY, not rule-list order', () => {
    // `.github/CONTRIBUTING.md` matches BOTH the SPEC wiring `.github/**`
    // glob and the SPEC docs `**/*.md` glob (distinct from the pinned
    // edge-case paths above, to prove the mechanism generically).
    const path = '.github/CONTRIBUTING.md';
    const base = posix.basename(path);
    expect(SPEC_RULES.wiring.some((test) => test(path, base))).toBe(true);
    expect(SPEC_RULES.docs.some((test) => test(path, base))).toBe(true);
    // wiring precedes docs in CLASSIFY_PRIORITY, so it wins over docs.
    expect(CLASSIFY_PRIORITY.indexOf('wiring')).toBeLessThan(CLASSIFY_PRIORITY.indexOf('docs'));
    expect(classifyFile(path)).toBe('wiring');
  });
});
