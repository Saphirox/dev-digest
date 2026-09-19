# DevDigest (repo-wide) — Insights

Append-only log of cross-cutting lessons (≥2 modules, `scripts/`, Docker, CI,
`.claude/`), written for the next agent — module-specific ones live in each
module's own INSIGHTS.md. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into the root AGENTS.md as a standing rule.

## What Works

## What Doesn't Work

- 2026-09-17 · `./scripts/dev.sh` cannot finish on this machine: it is `set -euo pipefail` (`scripts/dev.sh:11`) and dies at `▸ applying migrations` on the pnpm wrapper — see the two Recurring Errors below — so the dev servers are never reached. Run it once anyway for its side effects (it creates `server/.env` + `client/.env` from the examples and waits for Postgres health), then start the stack yourself: `(cd server && ./node_modules/.bin/tsx watch src/server.ts)` + `(cd client && ./node_modules/.bin/next dev -p 3000)`.
- 2026-09-19 · `pkill -f "tsx src/server.ts"` does NOT stop the API: it kills tsx's wrapper, while the child that actually holds :3001 runs as `node --require …/tsx/dist/preflight.cjs --import …/tsx/dist/loader.mjs src/server.ts`, whose argv never contains the typed string. `pgrep` then reports nothing and the port stays bound — one such orphan survived a day and silently served a later "restart", so browser checks hit stale code. Confirm by port, not by pattern: `lsof -nP -iTCP:3001 -sTCP:LISTEN` and `kill <pid>`. Started from `server/src/server.ts:1`.

## Codebase Patterns

- 2026-09-16 · Before building a "missing" feature, `grep -rn 'DROP COLUMN' server/src/db/migrations/` — the course starter carves lesson features out with a LATE migration while leaving the producing code intact. `0009_complex_runaways.sql` drops `agent_runs.cost_usd`, yet `usage.cost` still flows from `openrouter.ts` → `ReviewOutcome.costUsd`; only the persist step is cut (`run-executor.ts:213` destructures `outcome` without `costUsd`). The feature is a re-wire, not a build.
- 2026-09-17 · Treat the shared dev database as the reverted integration branch's answer key: `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\d <table>'` shows the columns, indexes and CHECK constraints that branch concluded it needed. Re-deriving the `agent_runs` cost index independently produced SQL identical to the live `agent_runs_pr_ran_at_idx` byte for byte — cheap corroboration before committing a design guess. `server/src/db/schema/runs.ts:1` (`agentRuns`).

- 2026-09-17 · In this course repo a **reverted** commit whose subject matches the feature IS the intended design — read its diff as the spec before designing anything. `0953fdc feat(reviews): severity chips + findings preview on the timeline runs` (reverted by `c6af1e4 restore main to the starter state`) says *"Match the lab design"* in its own message and contains the whole answer. Finding it and mining it only for INSIGHTS material, as happened here, cost a full build of the wrong UI (a PR-wide counter row + `?sev=` filter) before the mock was compared. Sibling of the `grep -rn 'DROP COLUMN' server/src/db/migrations/` lesson above: `git log --oneline main..` and `git log --all --oneline | grep -i <feature>` are step zero. Evidence: `client/src/components/findings-preview/FindingsPreviewCard.tsx:1` is a near-copy of that commit's file.

- 2026-09-18 · Grading criteria outrank both the written brief and the design mock — reconcile a feature against the rubric BEFORE deleting anything. The mock for findings-by-severity showed one of two required surfaces (timeline chips, hover); reading it as the whole truth led to deleting the clickable pills that criterion 16 puts inside the expanded run card, and they had to be recovered from a soft-reset commit. When brief, mock and rubric disagree, the rubric is the contract and the other two are partial views of it. `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/SeverityPills.tsx:1`.
- 2026-09-18 · A soft-reset commit is still a reachable object — `git show <sha>:<path>` recovers deleted work long after `git reset --soft` appeared to discard it, and `git cat-file -t <sha>` confirms it first. Recovering the severity-filter component this way turned a rewrite into a relocate. Verified on `c2d0a8a` after five later commits. `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:1` (`countBySeverity`).

## Tool & Library Notes

- 2026-09-16 · A fresh worktree has node_modules in `server/` ONLY; install `reviewer-core/` too before booting or typechecking the server. tsconfig aliases `@devdigest/reviewer-core` to its SOURCE, so the engine's own runtime deps must exist: without them the API dies at boot with `ERR_MODULE_NOT_FOUND: Cannot find package 'openai'`, and `tsc` reports phantom `unknown is not assignable to T` errors in `server/src/adapters/llm/{openai,anthropic}.ts` that vanish once the deps are there — don't debug those files. `server/tsconfig.json:1` (the `@devdigest/reviewer-core` path alias).
- 2026-09-17 · `reviewer-core` is an **npm** package (`package-lock.json`; `scripts/dev.sh:81` runs `npm ci` there) while `server`/`client` use pnpm. Running `pnpm install` in it silently writes a competing `reviewer-core/pnpm-lock.yaml` — check `git status` before committing; pnpm also scaffolds a `pnpm-workspace.yaml` in every package it touches.
- 2026-09-17 · The branch under an emdash worktree can be switched by tooling MID-SESSION: work started on `emdash/mighty-seas-sneeze-030k8` and committed onto `feature/01-lab-run-findings` without any checkout of mine. The session-start git snapshot goes stale — run `git rev-parse --abbrev-ref HEAD` right before committing and before reporting where work landed. Recovery is just `git branch -f <intended> <sha> && git checkout <intended>`. Seen against `CLAUDE.md:1` (the worktree the session was started in).
- 2026-09-17 · A review of *uncommitted* work in an emdash worktree reads a moving target: another session can be editing the same files while you review. Two real bugs found in `FindingsTab.tsx` were already fixed on disk by the time the findings were written (its md5 changed twice mid-task, and new untracked files appeared). Re-run `git diff HEAD` and re-read every file you are about to report on immediately before reporting — and when a probe test passes where your reading of the source says it must fail, suspect the file changed under you, not your reading. Seen on `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:55`.

- 2026-09-19 · Capturing images to COMMIT (docs, PR bodies): use the browser `zoom` action, not a full `screenshot`. With `save_to_disk`, a full screenshot lands as `.jpg` while `zoom` lands as `.png` — so a full-page grab checked into `docs/images/` is a lossy JPEG of a dark UI. `zoom` also crops to the block being documented, which is what a reviewer needs. Verified capturing the six PR screenshots into `docs/images/pr/`; the repo's doc index that such images belong under is `CLAUDE.md:96` (`## Docs`).

## Recurring Errors & Fixes

- 2026-09-16 · `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts … Run "pnpm approve-builds"` on ANY `pnpm <script>` → run the binary directly (`./node_modules/.bin/drizzle-kit generate`, `./node_modules/.bin/vitest run`) or install with `pnpm install --config.strictDepBuilds=false` — pnpm 11 runs a dep-status check before every script and fails the script itself, though the deps are fine. It also drops a stray `server/pnpm-workspace.yaml` (allowBuilds placeholders), which contradicts the repo's no-workspace layout: delete it, it is not in HEAD. Config it fights with: `CLAUDE.md:7` ("no pnpm workspace"); recurred while running `server/package.json:1` scripts.
- 2026-09-16 · `pnpm db:migrate` → `42701 duplicate column` on a brand-new migration: the `devdigest_pgdata` volume is SHARED across worktrees and is ahead of the starter branch (17 migrations applied, and `agent_runs` already carries `cost_usd`, `critical_count`, `warning_count`, `suggestion_count` from the reverted integration branch). The migration is not wrong — the DB is from another branch. Never `docker compose down -v` to "fix" it (real imported repos live there); verify the schema with `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\d agent_runs'` and let the `.it.test.ts` testcontainers run prove the migration against a clean DB instead. `server/src/db/migrations/0009_complex_runaways.sql:1`; volume declared at `docker-compose.yml:1`.

## Session Notes

- 2026-09-16 · Spec + plan for the Run Cost feature (`docs/specs/run-cost.md`) — no code changed; +3 insights (Codebase Patterns ×1 root, client ×1, reviewer-core ×1)
- 2026-09-16 · Implemented Run Cost across server + client (9 steps, all 3 screens verified in-browser) — +3 insights (Tool & Library Notes, Recurring Errors ×2)
- 2026-09-17 · Ran the stack + skill review pass (drizzle/react) over the Run Cost diff — 1 bug found and fixed; +3 insights (root What Doesn't Work, server Codebase Patterns, client Codebase Patterns)
- 2026-09-17 · Committed the Run Cost work as 7 commits, moved them onto the intended branch, added the agent_runs index — +4 insights (root Codebase Patterns, Tool & Library Notes ×2, server Codebase Patterns)
- 2026-09-17 · Correctness review of the Findings-by-severity diff (client + e2e, uncommitted) — 5 findings reported, 2 more fixed by the implementing session mid-review; +1 insight (root Tool & Library Notes)
- 2026-09-17 · Rebuilt Findings-by-severity against the actual mock after the first attempt shipped the wrong shape — +1 insight (Codebase Patterns)
- 2026-09-18 · Closed 11 HW#1 rubric gaps (cost SUM, run-card pills + filter, PR-list FINDINGS column, per-package docs, conventions, citations, Stop hook) — +4 insights (root Codebase Patterns ×2, client Codebase Patterns ×2)
- 2026-09-19 · Stopped the dev stack and deleted the stale `feature/01-lab-run-findings` branch — +1 insight (root What Doesn't Work)
- 2026-09-19 · Wrote the PR description + captured six screenshots — +1 insight (Tool & Library Notes)

## Open Questions
