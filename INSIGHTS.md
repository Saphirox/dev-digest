# DevDigest (repo-wide) — Insights

Append-only log of cross-cutting lessons (≥2 modules, `scripts/`, Docker, CI,
`.claude/`), written for the next agent — module-specific ones live in each
module's own INSIGHTS.md. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into the root CLAUDE.md as a standing rule.

## What Works

## What Doesn't Work

- 2026-09-17 · `./scripts/dev.sh` cannot finish on this machine: it is `set -euo pipefail` (`scripts/dev.sh:11`) and dies at `▸ applying migrations` on the pnpm wrapper — see the two Recurring Errors below — so the dev servers are never reached. Run it once anyway for its side effects (it creates `server/.env` + `client/.env` from the examples and waits for Postgres health), then start the stack yourself: `(cd server && ./node_modules/.bin/tsx watch src/server.ts)` + `(cd client && ./node_modules/.bin/next dev -p 3000)`.

## Codebase Patterns

- 2026-09-16 · Before building a "missing" feature, `grep -rn 'DROP COLUMN' server/src/db/migrations/` — the course starter carves lesson features out with a LATE migration while leaving the producing code intact. `0009_complex_runaways.sql` drops `agent_runs.cost_usd`, yet `usage.cost` still flows from `openrouter.ts` → `ReviewOutcome.costUsd`; only the persist step is cut (`run-executor.ts:213` destructures `outcome` without `costUsd`). The feature is a re-wire, not a build.

## Tool & Library Notes

- 2026-09-16 · A fresh worktree has node_modules in `server/` ONLY; install `reviewer-core/` too before booting or typechecking the server. tsconfig aliases `@devdigest/reviewer-core` to its SOURCE, so the engine's own runtime deps must exist: without them the API dies at boot with `ERR_MODULE_NOT_FOUND: Cannot find package 'openai'`, and `tsc` reports phantom `unknown is not assignable to T` errors in `server/src/adapters/llm/{openai,anthropic}.ts` that vanish once the deps are there — don't debug those files.

## Recurring Errors & Fixes

- 2026-09-16 · `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts … Run "pnpm approve-builds"` on ANY `pnpm <script>` → run the binary directly (`./node_modules/.bin/drizzle-kit generate`, `./node_modules/.bin/vitest run`) or install with `pnpm install --config.strictDepBuilds=false` — pnpm 11 runs a dep-status check before every script and fails the script itself, though the deps are fine. It also drops a stray `server/pnpm-workspace.yaml` (allowBuilds placeholders), which contradicts the repo's no-workspace layout: delete it, it is not in HEAD.
- 2026-09-16 · `pnpm db:migrate` → `42701 duplicate column` on a brand-new migration: the `devdigest_pgdata` volume is SHARED across worktrees and is ahead of the starter branch (17 migrations applied, and `agent_runs` already carries `cost_usd`, `critical_count`, `warning_count`, `suggestion_count` from the reverted integration branch). The migration is not wrong — the DB is from another branch. Never `docker compose down -v` to "fix" it (real imported repos live there); verify the schema with `docker exec devdigest-postgres psql -U devdigest -d devdigest -c '\d agent_runs'` and let the `.it.test.ts` testcontainers run prove the migration against a clean DB instead.

## Session Notes

- 2026-09-16 · Spec + plan for the Run Cost feature (`docs/specs/run-cost.md`) — no code changed; +3 insights (Codebase Patterns ×1 root, client ×1, reviewer-core ×1)
- 2026-09-16 · Implemented Run Cost across server + client (9 steps, all 3 screens verified in-browser) — +3 insights (Tool & Library Notes, Recurring Errors ×2)
- 2026-09-17 · Ran the stack + skill review pass (drizzle/react) over the Run Cost diff — 1 bug found and fixed; +3 insights (root What Doesn't Work, server Codebase Patterns, client Codebase Patterns)

## Open Questions
