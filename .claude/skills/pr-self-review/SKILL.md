---
name: pr-self-review
description: "Local pre-PR self-review for DevDigest: collects every open change (branch commits vs origin/main plus staged, unstaged and untracked files), runs the repo's hard-rule checks and arch:check, routes each changed file to the matching project skills (UI skills for client files, onion/fastify/drizzle/postgres for backend files, security and zod where relevant), reviews the diff against each skill in parallel, verifies every critical, and gives a PASS/BLOCK verdict. Any unoverridden critical blocks the change: a hook denies `gh pr create`, `gh pr merge` and `git push` until the current diff has a PASS. Use before opening a pull request, before pushing a branch for review, when a push or `gh pr create` is denied by the pr-self-review gate, or when the user says self-review, pre-PR check, review my changes, is this ready for a PR, or /pr-self-review. Not for reviewing someone else's GitHub PR by number: that is /code-review."
# Manual only: the user runs /pr-self-review. The model can't invoke it on its own;
# when the push/PR gate blocks, it tells the user to run it.
disable-model-invocation: true
metadata:
  version: "1.1.0"
  updated: "2026-09-19"
---

# PR Self Review

Review the local changes before a PR exists. Scripts do everything
mechanical: the diff, the checks, routing, cache, the verdict and the gate.
Your job is to run the reviewers and the verifier, then help the author get
to PASS.

All paths are relative to the repo root. `S=.claude/skills/pr-self-review/scripts`.

| File | Read it when |
|---|---|
| [references/severity.md](references/severity.md) | Always, before judging any finding |
| [references/reviewer-prompt.md](references/reviewer-prompt.md) | Step 3 and step 4: the subagent prompts |
| [references/routing.json](references/routing.json) | Deciding which skill reviews which file, or adding a new skill |

## Hard rules

1. **Never write an override yourself.** Only the user decides that a
   critical is a false positive. They must say so explicitly, and you pass
   their reason verbatim (step 6).
2. **Never apply a fix without confirmation** (step 5).
3. **Never edit `.devdigest/self-review/**` or the cache by hand** to change
   a verdict. The gate trusts these files. Editing them defeats the gate.
4. A verdict belongs to one exact diff. Any edit after it makes it stale,
   and the gate treats a stale verdict as missing. Committing does not
   change the diff, so reviewing before `git commit` is fine.

## Workflow

### 1. Prepare

```sh
node $S/prepare.mjs            # add --base <ref> only if the PR targets something other than main
```

It prints `runDir`, `diffHash`, the deterministic results
(`deterministic.critical/warning`, `archCheck`), `reusedFromCache`, and
`units`: `{skill, files, patch, findingsFile}`, which is the LLM review work
that is left.

- `changedFiles: 0`: there is nothing to review. Say so and stop.
- `archCheck: skipped …`: tell the user the onion edges were not checked
  mechanically. Install server deps to enable it.

### 2. Tell the user the plan (one short block)

Show the skill → files routing, how many units came from cache, and any
deterministic criticals that already block. Do not wait for approval. Continue.

### 3. Run the reviewers (parallel)

Launch one `general-purpose` subagent per `units[]` entry, all in a single
message, with the **Reviewer** template from `references/reviewer-prompt.md`.
Each subagent writes its own `findingsFile`.

- Small diff (≤ 2 units and < 200 added lines): you may review inline
  instead. Follow the same template, and write the same JSON files yourself.
- A reviewer that fails or writes nothing: rerun it once. Otherwise the
  verdict is `INCOMPLETE`, which never passes.

### 4. Verify criticals

Collect every `"severity": "critical"` from the `findingsFile`s. If any
exist, launch **one** fresh verifier subagent with the **Verifier** template,
using `baseSha` from `runDir/meta.json`. It writes `runDir/verification.json`.
A critical without a verification status stays blocking as `unverified`.
The gate fails closed.

Deterministic criticals (`source: deterministic`) need no verification.
They are proven by git or by dependency-cruiser.

### 5. Verdict

```sh
node $S/verdict.mjs <runDir>   # exit 0 PASS · 2 BLOCK · 3 STALE · 4 INCOMPLETE
```

The script applies the rules mechanically:
- A critical without `rule`, `evidence` and `failure_scenario` becomes a warning.
- A critical off the changed lines becomes a warning marked pre-existing.
- A critical the verifier rejected is dropped. One it downgraded becomes a warning.
- Findings on overlapping lines are merged into one, owned by the skill
  that comes first in `routing.json`.

It writes `report.md`, `report.json`, `pr-section.md` and the verdict the
gate reads.

- **STALE**: files changed during the run. Go back to step 1. Unchanged
  units come from cache.
- **PASS**: report the counts and any warnings worth fixing, and offer
  `pr-section.md` for the PR body.
- **BLOCK**: list each blocking critical with its failure scenario and
  proposed fix. Then **fix mode**: ask which fixes to apply with
  `AskUserQuestion` (multiSelect, one option per critical). Apply only the
  chosen ones, then go back to step 1. The rerun re-reviews only the files
  you touched.

### 6. Overrides (the user's decision only)

When the user says a specific critical is a false positive:

```sh
node $S/verdict.mjs <runDir> --override <findingId> --reason "<the user's reason, verbatim>"
```

The override is keyed to the flagged code, not the line number. It stays
valid across runs until that code changes. It is listed in `report.md` and
in `pr-section.md`, so the PR reviewer sees it.

### 7. Optional: publish to GitHub (only when asked)

`node $S/publish-status.mjs` sets the commit status `pr-self-review` on
HEAD. It needs a clean tree. It is outward-facing, so ask first. It blocks
merging only if the repo admin has made `pr-self-review` a required status
check in branch protection for `main`. Say so the first time.

## Enforcement

- **Claude Code**: a `PreToolUse` hook in `.claude/settings.json` runs
  `$S/gate.mjs` on every Bash call. It denies `gh pr create|ready|merge` and
  `git push` unless the current diff has a PASS.
- **Terminal**: to make pushes outside Claude go through the same gate, the
  user can opt in (it is local and never committed):
  `h="$(git rev-parse --git-common-dir)/hooks/pre-push"; printf '#!/bin/sh\nexec node "$(git rev-parse --show-toplevel)/.claude/skills/pr-self-review/scripts/gate.mjs" --pre-push\n' > "$h" && chmod +x "$h"`.
  In worktrees, `hooks/` lives in the common git dir.

## Staged mode

`prepare.mjs --staged` / `verdict.mjs --staged` review only the index vs
HEAD. It is the engine of `/staged-changes-review`
(`../staged-changes-review/SKILL.md`), so script changes here affect both
skills. A staged verdict never satisfies the gate, because its diff hash has
its own prefix. It shares the cache and `overrides.json`.

## Adding or changing a skill

Add the new skill to `references/routing.json` under `skills`, or under
`excluded`. Otherwise every run reports `unrouted-skill`. The cache key
includes each skill's directory hash, so editing a skill re-reviews its
files automatically.
