# Rebase-before-commit hook — research

Status: implemented (uncommitted) · Date: 2026-09-20 · Scope: `.claude/`

## Goal

Every `git commit` Claude runs is preceded by a fetch and a rebase onto the
freshest `origin/main`. On conflicts the user gets a three-sentence summary with
`file:line` references, or both implementations to choose from.

## Approach

`PreToolUse` hook on `Bash` (`.claude/hooks/rebase-before-commit.mjs`,
registered in `.claude/settings.json`). Git's own `pre-commit` hook is rejected:
moving `HEAD` while `git commit` holds the index lock is unsafe.

1. Match `git commit` (quoted text stripped, as in the pr-self-review gate).
   Skip while a rebase is in progress.
2. `git fetch origin <default>`; offline → allow with a warning.
3. `origin/<default>` already an ancestor of `HEAD` → silent.
4. `git merge-tree --write-tree` dry run (git ≥ 2.38): exit 1 lists conflicts
   without touching index or worktree → `deny` with facts.
5. Partly staged files → `deny` (staging cannot survive an autostash).
6. `git rebase [--autostash] origin/<default>`, re-stage recorded paths, allow
   with context. A real rebase conflict is aborted, then reported like step 4.

Facts per conflicted file: marker line ranges, main's last commit, our last
commit. The deny reason instructs Claude to answer in exactly three
medium-length sentences citing `file:line`, or to show both implementations.

## Constraints found

- `main` is checked out in the primary clone, so use `origin/main`, never `git pull`.
- The stash stack and the index are shared across worktrees/sessions.
- A rebase changes the diff hash: earlier `/pr-self-review` verdicts go stale,
  and an already-pushed branch needs `--force-with-lease`.
- `merge-tree` simulates a merge; a per-commit rebase can still conflict, hence the abort path.
- The hook fails open: an internal error never blocks a commit.

## Files

`.claude/hooks/rebase-before-commit.{mjs,test.mjs}` · `.claude/skills/git-rebase-sync/`
· `.claude/settings.json` · `.claude/skills/README.md` · `AGENTS.md` (Before a PR).
Tests: `node --test .claude/hooks/rebase-before-commit.test.mjs`.
