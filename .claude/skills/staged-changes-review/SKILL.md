---
name: staged-changes-review
description: "Local review of the STAGED changes only (git index vs HEAD) for DevDigest — the pr-self-review workflow narrowed to what `git commit` would record right now: runs the repo's hard-rule checks and arch:check, routes each staged file to the matching project skills, reviews the staged diff against each skill in parallel, verifies every critical, and gives a PASS/BLOCK verdict. Unstaged edits, untracked files and earlier branch commits are out of scope. Use before a commit, or when the user says review staged, review what I staged, check the index, pre-commit review, or /staged-changes-review. Not the PR gate: a staged PASS never satisfies the push/`gh pr create` hook — that needs /pr-self-review. Not for someone else's GitHub PR: that is /code-review."
# Manual only, like pr-self-review: the user runs /staged-changes-review.
disable-model-invocation: true
metadata:
  version: "1.0.0"
  updated: "2026-09-21"
---

# Staged Changes Review

The `pr-self-review` workflow, scoped to the **index vs HEAD**. It uses the
same scripts, rubric, prompts, routing, cache and overrides. Only the diff
is different. Every script runs with `--staged`.

All paths are relative to the repo root. `P=.claude/skills/pr-self-review`,
`S=$P/scripts`.

| File | Read it when |
|---|---|
| [$P/SKILL.md](../pr-self-review/SKILL.md) | The full workflow. This file only lists how staged mode differs |
| [$P/references/severity.md](../pr-self-review/references/severity.md) | Always, before judging any finding |
| [$P/references/reviewer-prompt.md](../pr-self-review/references/reviewer-prompt.md) | Step 3 and step 4: the subagent prompts, plus the staged additions below |
| [$P/references/routing.json](../pr-self-review/references/routing.json) | Deciding which skill reviews which file |

## What "staged" means here

| | pr-self-review | staged-changes-review |
|---|---|---|
| Diff | working tree + untracked vs merge-base with `origin/main` | `git diff --cached HEAD` |
| File content reviewed | the file on disk | the index: `git show :<path>` |
| STALE when | anything in the open diff changes | the staged set or HEAD changes (unstaged edits don't count) |
| "Merged migration" check | vs merge-base | vs merge-base as well, so a migration committed on this branch stays editable |
| Satisfies the push/PR gate | yes, on PASS | **never**: the diff hash has its own `staged:` prefix |

## Hard rules

pr-self-review's hard rules 1–3 apply unchanged: never write an override
yourself, never apply a fix without confirmation, and never hand-edit
`.devdigest/self-review/**`. Rule 4 in staged form: a verdict belongs to one
exact staged diff on one HEAD. `git add`, `git reset` or a commit/rebase
that moves HEAD makes it stale.

## Workflow

Follow pr-self-review's steps 1–6 with these differences.

### 1. Prepare

```sh
node $S/prepare.mjs --staged     # --base <ref> only moves the merge-base used by the migration check
```

The summary starts with `scope: staged (index vs HEAD)`. `changedFiles: 0`
means nothing is staged. Say so and stop, and mention that unstaged work
exists if `git status --short` shows any.

`arch:check` runs dependency-cruiser on the files **on disk**. If a staged
`.ts` file under `server/src` or `reviewer-core/src` also has unstaged edits
(`git diff --name-only` lists it), say that the arch result for that file
reflects the working copy.

### 2. Tell the user the plan

This is the same one short block as in pr-self-review, headed "staged
changes". Do not wait for approval.

### 3. Reviewers

Use the **Reviewer** template unchanged, and append this paragraph to every
reviewer prompt:

```
Scope is the STAGED version of each file (git index), not the file on disk — they differ when a file is partially staged. For full-file context run `git show :<path>`; do not Read the path from disk. Report only problems on the staged added lines.
```

The small-diff inline option and the rerun-once rule are the same.

### 4. Verify criticals

Use the **Verifier** template, with step 2 changed to
`git diff --cached {baseSha} -- <file>` and "open the file" changed to
`git show :<file>`. `baseSha` in `runDir/meta.json` is HEAD.

### 5. Verdict

```sh
node $S/verdict.mjs <runDir>     # or: node $S/verdict.mjs --staged
```

The exit codes and rules are the same. The report is headed
`Staged review:`, and `latest-staged.json` is written instead of
`latest.json`.

- **STALE**: the index or HEAD moved. Go back to step 1. Unchanged
  (skill, file) pairs come from the shared cache.
- **PASS**: report the counts and the warnings worth fixing. The changes
  are ready to commit. Say plainly that a PR still needs `/pr-self-review`.
  Do not offer `pr-section.md`, because it describes a commit, not a PR.
- **BLOCK**: use fix mode as in pr-self-review. After applying a chosen
  fix, **ask before `git add`-ing it**, because staging is the user's
  choice. Then go back to step 1.

### 6. Overrides

```sh
node $S/verdict.mjs <runDir> --override <findingId> --reason "<the user's reason, verbatim>"
```

Overrides live in the shared `overrides.json` and are keyed to the flagged
code. An override given here therefore also applies to the same finding in
a later `/pr-self-review`. Tell the user that when they override.

### Not in staged mode

- `publish-status.mjs`: a commit status must describe HEAD, and staged
  changes are not in HEAD yet.
- Enforcement: no hook runs this review. The push/PR gate reads only full
  verdicts.
