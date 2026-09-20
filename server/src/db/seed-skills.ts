/**
 * Built-in skills used by the seed, bound to the two skill-driven agents.
 *
 * A skill is reusable review guidance: text + configuration only. The agent's
 * own prompt stays general; these bodies carry the concrete checklists, which is
 * what the skills-off / skills-on control experiment measures
 * (docs/experiments/skills-control.md). The DB row is the source of truth at run
 * time; editing a body here only affects freshly seeded workspaces.
 */

export interface SeedSkill {
  name: string;
  /** Directive: says when the skill applies. */
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
  /** Agent the seed links it to, in this array's order. */
  agent: 'Test Quality Reviewer' | 'API Contract Reviewer';
}

/**
 * Seed skills renamed after they shipped: the seed renames an old row in place
 * (keeping its id, links and versions) instead of creating a duplicate.
 */
export const RENAMED_SEED_SKILLS: Record<string, string> = {
  'contract-breaking-change': 'breaking-change',
  'response-shape-guard': 'response-schema',
};

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'test-coverage-nudge',
    description: 'Use when a PR adds or changes a function that branches.',
    type: 'custom',
    agent: 'Test Quality Reviewer',
    body: `For every function the diff adds or changes, list its branches before you read the tests:
- each \`if\` / \`else\`, \`switch\` case, early \`return\` or \`throw\`, \`catch\` block;
- each \`??\`, \`||\`, \`&&\` fallback and each ternary;
- each loop that can run zero times.

Then, for each branch, find the test in the diff (or already referenced by it) that drives
execution down that branch and asserts its outcome.

- A branch with no such test is a finding. Cite the production line of the branch.
- An error, guard or validation branch with no test is CRITICAL: that is exactly the path
  that breaks silently.
- Any other untested branch is a WARNING.
- A test file that only exercises the success path of a function with several branches
  is itself a finding: name the branches it skips.`,
  },
  {
    name: 'corner-case-checklist',
    description: 'Use when a PR adds or changes tests for a function that takes input.',
    type: 'rubric',
    agent: 'Test Quality Reviewer',
    body: `For each input the changed function takes, check the tests cover the boundaries that apply:
- empty: \`""\`, \`[]\`, \`{}\`, a file with no lines;
- zero, one, and many; the first and the last element;
- the limit and one past it: max length, page size, a threshold (\`>=\` vs \`>\`);
- negative numbers, \`NaN\`, very large numbers, floating-point rounding for money;
- \`null\` / \`undefined\` / a missing optional field;
- duplicates, unsorted input, and unicode or whitespace-only strings;
- dates at midnight, month end, DST changes and other time zones.

Report a boundary as missing only when the code does something different there (a
comparison, a slice, a default, a division). Name the boundary and the assertion that
would pin it. Missing boundaries on a threshold or a money calculation are CRITICAL.`,
  },
  {
    name: 'mocking-smells',
    description: 'Use when a PR adds or changes tests that mock, stub or spy.',
    type: 'convention',
    agent: 'Test Quality Reviewer',
    body: `Flag tests whose mocks make them unable to fail:
- the unit under test is itself mocked, or its own module is stubbed out;
- the test asserts that a mock was called instead of asserting the outcome a user or caller sees;
- a mock returns exactly what the assertion checks, so the code in between is never exercised;
- a mocked dependency's behaviour contradicts the real one (e.g. never rejects, never returns empty).

Flag flakiness:
- real timers, \`sleep\` / \`setTimeout\` waits, \`Date.now()\` or \`Math.random()\` without control;
- network, filesystem or ports the test doesn't own;
- tests that depend on the order they run in or on state left by another test.

Mocking at the boundary (HTTP, clock, database in a unit test) is fine; say so rather than flag it.`,
  },
  {
    name: 'breaking-change',
    description:
      'When the diff changes a route signature, request/response shape or status code, classify it as breaking or compatible.',
    type: 'rubric',
    agent: 'API Contract Reviewer',
    body: `## Breaking vs compatible

Classify every change to a public surface. BREAKING means an existing caller,
written against the previous version and unchanged, stops working.

**Breaking — report as CRITICAL**
- Removing or renaming a request or response field.
- Adding a required request field, or making an optional one required.
- Narrowing a type, enum, or validation rule on input.
- Changing a response field's type or making a non-null field nullable.
- Changing a status code, error code, or error body shape.
- Changing a route path, method, or parameter name/order.
- Removing a default that callers relied on, or changing what it means.

**Compatible — do not report as breaking**
- Adding an optional request field with a default.
- Adding a response field (unless the consumer validates strictly and rejects
  unknown keys — check whether it does before deciding).
- Loosening input validation.

For every breaking change, name the caller that breaks and give the compatible
alternative: a new optional field, a new route/version, or a deprecation window.

### Bad — a rename, dressed as a cleanup

\`\`\`diff
 export const Repo = z.object({
   id: z.string(),
-  full_name: z.string(),
+  fullName: z.string(),
 });
\`\`\`

Every consumer reading \`full_name\` now reads \`undefined\`. Nothing fails at build
time on the other side of the wire. CRITICAL.

### Good — additive, with the old field kept until callers move

\`\`\`diff
 export const Repo = z.object({
   id: z.string(),
-  full_name: z.string(),
+  /** @deprecated use fullName; removed in v3 */
+  full_name: z.string(),
+  fullName: z.string(),
 });
\`\`\`

Both shapes ship, old callers keep working, and the removal is a separate,
announced change.`,
  },
  {
    name: 'response-schema',
    description:
      'When a handler changes what it returns, check the declared schema and every copy of the contract agree with it.',
    type: 'convention',
    agent: 'API Contract Reviewer',
    body: `## The handler and the contract must agree

For each route the diff touches:

1. Compare what the handler actually returns against the response schema it
   declares. Extra fields that no schema mentions leak; missing fields break the
   consumer. A route with NO declared response schema and a changed return shape
   is itself worth a finding.
2. Check the DTO mapping. A row→DTO function that gained a field, dropped one, or
   changed a null default changes the wire contract even when the route did not.
3. Check every copy of the contract. When a schema is duplicated across packages,
   a change to one copy leaves the other stale — producer and consumer now
   disagree, and nothing will fail at build time.

Report the specific field, both sides of the disagreement, and which one is
wrong.

### Bad — the handler and its declared schema drift apart

\`\`\`ts
// route declares: response: { 200: z.object({ id: z.string(), score: z.number() }) }
return { id: row.id, score: row.score, internalNotes: row.notes };
\`\`\`

\`internalNotes\` is either stripped silently or leaks, depending on whether the
serializer is active. Neither is what the author intended, and no test says so.

### Good — one shape, declared and returned

\`\`\`ts
// response: { 200: ReviewDto }
return ReviewDto.parse({ id: row.id, score: row.score });
\`\`\`

### Bad — a DTO mapper changing the wire contract with no route change

\`\`\`diff
 export function toRepoDto(row: RepoRow): Repo {
-  return { id: row.id, full_name: row.fullName, clone_path: row.clonePath };
+  return { id: row.id, full_name: row.fullName };
 }
\`\`\`

The route is untouched, so the diff reads as internal — but \`clone_path\` just
disappeared from every response. Report it as a response change, not a refactor.`,
  },
  {
    name: 'deprecation-policy',
    description:
      'When the diff removes or replaces a public surface, require a deprecation window instead of a silent deletion.',
    type: 'convention',
    agent: 'API Contract Reviewer',
    body: `# Deprecation over deletion

A public surface is never deleted in the same change that replaces it. Deletion is
a separate, later change, made after callers have had a release to move. When the
diff removes or replaces something callers depend on, check for all four parts of
a deprecation and report whichever is missing.

## The four parts

1. **The old surface still works.** The field, route, or export is still there and
   still returns what it returned before.
2. **It is marked.** \`@deprecated\` on the symbol or schema field, with one line
   saying what to use instead.
3. **The replacement exists in the same change.** A deprecation with nowhere to go
   is just an unannounced removal with extra steps.
4. **The removal is scheduled.** A version or date, in the marker itself — not in a
   ticket nobody reading this code will see.

A removal that skips part 1 is a breaking change; report it as CRITICAL and say so.
A removal that has part 1 but is missing 2, 3, or 4 is a WARNING: callers keep
working today, but nothing tells them they are on a dead path.

## Bad — silent deletion

\`\`\`diff
 export const ReviewDto = z.object({
   id: z.string(),
-  score: z.number(),
   rating: z.number(),
 });
\`\`\`

\`score\` is gone in the same commit \`rating\` appears. Every consumer reading \`score\`
breaks on deploy, with no warning in any previous release. The rename is invisible
in the type system of anyone downstream.

## Bad — marked, but removed anyway

\`\`\`diff
-  /** @deprecated use rating */
-  score: z.number(),
\`\`\`

The marker was added and the field deleted in the same release. A deprecation
window that never elapsed is not a deprecation.

## Good — both shapes, marked, with an end date

\`\`\`diff
 export const ReviewDto = z.object({
   id: z.string(),
+  /** @deprecated use \`rating\`; removed in v3.0 (2026-10) */
   score: z.number(),
+  rating: z.number(),
 });
\`\`\`

Old callers keep reading \`score\`, new callers read \`rating\`, and the removal is a
scheduled change someone can plan for.

## Good — a route deprecated by addition

\`\`\`diff
+app.get('/reviews/:id/summary', handler);          // replacement
 app.get('/reviews/:id/digest', async (req, reply) => {
+  reply.header('Deprecation', 'true');
+  reply.header('Sunset', 'Wed, 01 Oct 2026 00:00:00 GMT');
+  reply.header('Link', '</reviews/:id/summary>; rel="successor-version"');
   return handler(req, reply);
 });
\`\`\`

## What to report

Name the surface, the caller that would break, and which of the four parts is
missing. When the change removes something with no replacement at all, say what a
caller is supposed to do instead — if there is no answer, that is the finding.`,
  },
];
