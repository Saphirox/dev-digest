# Control experiment: skills off vs on

Shows that a skill changes what an agent finds. Each of the two skill-driven agents
reviews the same PR twice: once with its skills unchecked, once with them checked.
The agent's own prompt is deliberately general; the concrete checklists live in its
skills (`server/src/db/seed-skills.ts`).

| Agent | PR | Skills off (expected) | Skills on (expected) |
|---|---|---|---|
| Test Quality Reviewer | adds `discountFor()` with a happy-path-only test | approves, or only generic remarks | flags the untested branches (negative subtotal throw, coupon, first-order bonus, the cap) and the `>= 10_000` boundary |
| API Contract Reviewer | changes the `/invoices` route signature | misses it, or calls it a refactor | CRITICAL breaking change: method + path moved, `customerId` → `customer`, `status` now required, `void` removed, `amountCents` → `amount`, `currency` dropped, `dueDate` string → number, array → `{ items }` |

Model output varies run to run. Run each side two or three times and compare what is
found consistently, not a single run.

## Files

`docs/experiments/skills-control/`:

- `test-quality-pr.patch`: the Test Quality PR (new files only; applies to any repo).
- `api-contract-base.patch`: the route **before** the change. Merge this to the
  default branch first, so the PR diff shows a signature change, not a new file.
- `api-contract-pr.patch`: the API Contract PR, which changes the route's signature.

The files are never built or run: the reviewer reads only the diff.

## 1. Prepare a repo (once)

Use any GitHub repo you can push to, imported into DevDigest (Onboarding → add repo).

```sh
git clone git@github.com:<you>/<demo-repo>.git && cd <demo-repo>
P=<path to dev-digest>/docs/experiments/skills-control

# API contract "before" state goes to the default branch first
git apply "$P/api-contract-base.patch"
git add -A && git commit -m "feat(invoices): list invoices route" && git push

# PR A: Test Quality
git switch -c exp/test-quality
git apply "$P/test-quality-pr.patch"
git add -A && git commit -m "feat(pricing): order discounts" && git push -u origin HEAD
gh pr create --fill

# PR B: API Contract
git switch main && git switch -c exp/api-contract
git apply "$P/api-contract-pr.patch"
git add -A && git commit -m "refactor(invoices): search endpoint" && git push -u origin HEAD
gh pr create --fill
```

Then open the repo's Pull Requests page in DevDigest so both PRs are synced.

## 2. Check the agents

`cd server && pnpm db:seed` creates both agents (disabled, which only keeps them out
of "Run all") and links their skills:

- **Test Quality Reviewer**: `test-coverage-nudge`, `corner-case-checklist`, `mocking-smells`
- **API Contract Reviewer**: `breaking-change`, `response-schema`, `deprecation-policy`

Import `docs/skills/semver-discipline.zip` (Skills → Add Skill → Import from file),
read the preview (the README and `install.sh` are listed as not imported), confirm,
enable it, and attach it to the API Contract Reviewer. This walks the import path end
to end.

## 3. Run: skills off

1. Agents → the agent → **Skills** tab → uncheck every skill (`0 of N enabled`).
2. Open the PR → **Run review** → pick the agent by name.
3. Open the run → **Trace** → **Prompt assembly**: there is **no** Skills block. The
   Live log shows `skills: none enabled for this agent`.
4. Note the findings.

## 4. Run: skills on

1. Check the skills again (`N of N enabled`).
2. Run the same agent on the same PR.
3. Trace → Prompt assembly now shows **Skills (dynamic) · +~T tokens** with one
   `### <skill name>` section per enabled skill, in the tab's order. The Live log shows
   `skills: N attached (+~T tokens) — <names>`.
4. Compare the findings with step 3.

## What to record

For each agent: both run IDs, the findings of each run, and a screenshot of the
Prompt assembly section with and without the Skills block. Unchecking a single skill
and rerunning removes exactly that `###` section from the block, which also shows that
a disabled skill never reaches the prompt.
