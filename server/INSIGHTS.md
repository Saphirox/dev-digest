# server — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's AGENTS.md as a standing rule.

_Compacted 2026-09-20: supersede chains collapsed into their current truth,
wording tightened. Dates are the date the lesson was learned._

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-17 · `agent_runs` HAS its index — `prRanAtIdx` on `(pr_id, ran_at DESC NULLS LAST)`, declared in `server/src/db/schema/runs.ts` and shipped as migration `0011_petite_molecule_man.sql`. Don't re-add it. Both hot reads rely on it: `listRunsForPull` (`server/src/modules/reviews/repository/run.repo.ts:44`) and the PR-list cost aggregation (`server/src/modules/pulls/routes.ts`, `latestCostByPr`).
- 2026-09-19 · `reviews` and `findings` still declare NO index (`server/src/db/schema/reviews.ts:9,28`), yet the PR-list FINDINGS column joins `findings.review_id → reviews.id` filtered by `reviews.pr_id IN (…)` on every list load (`server/src/modules/pulls/routes.ts`, `findingsByPr`). Same situation `agent_runs` was in before 0011 — add `reviews(pr_id, …)` + `findings(review_id)` in a new migration before this query grows.
- 2026-09-19 · `memory.embedding`/`code_chunks.embedding` (`vector(1536)`) are schema+adapter-only: grepping `server/src/modules/` and `adapters/` for `cosineDistance`/`<=>`/`embedding` finds zero write or query code — the feature is gated behind `EMBEDDINGS_ENABLED` (default false) and no HNSW/ivfflat index exists on either column (only btree on `workspaceId`/`repoId`). Add one before any real similarity query. `server/src/db/schema/context.ts:43`, `server/src/db/schema/knowledge.ts:21`.
- 2026-09-19 · Any embeddings feature needs `OPENAI_API_KEY` regardless of which provider the review agents use: `Embedder` has exactly one real implementation, `OpenAIEmbedder`, Anthropic has no embeddings API (throws if called), and `container.embedder()` has no fallback. `server/src/adapters/embedder/openai.ts:7`, `server/src/adapters/llm/anthropic.ts:19,154`, `server/src/platform/container.ts:195`.
- 2026-09-19 · Layering is machine-checked: `.dependency-cruiser.cjs` + `arch:check` → **0 errors / 27 warnings**. A rising warning count = new debt. Known debt: routes in `polling`/`workspace`/`settings` query Drizzle via `container.db`; `repo-intel`'s pipeline imports concrete `adapters/*`; `service ↔ container` type cycles. `pulls` is now refactored to the full `routes → service → repository` split with a `PullsStore` port in `ports.ts`. Details: `.claude/skills/onion-architecture/references/layers-and-dependency-rule.md`. `server/.dependency-cruiser.cjs:1`.
- 2026-09-19 · Transactions: Drizzle's `tx` has the same query API as `db`, so a repository method can wrap its own writes without a UnitOfWork port — `SkillsRepository.insert/update` (row + `skill_versions` snapshot) and `AgentsRepository.setSkills` (delete + reinsert links) do exactly that (`server/src/modules/skills/repository.ts:1`). → now a rule in server/AGENTS.md (Onion layering bullet). Reach for the `UnitOfWork` + `DbExecutor` port only when a SERVICE must span repositories; the natural first case is `PullsRepository.replaceDetail` (delete + insert `pr_files`/`pr_commits`, then update the PR), still unwrapped. `server/src/modules/pulls/repository.ts:1`.
- 2026-09-19 · Moving the PR-list cost total into SQL is semantics-safe: Postgres `SUM(cost_usd)` already skips NULLs and returns NULL when every input is NULL, and a PR with no `done` runs yields no group — exactly the "null = unknown, never 0" rule the JS loop hand-implemented. Drizzle's `sum()` returns a string: use `.mapWith(Number)`. Guard: `server/test/pulls-cost-total.it.test.ts:1`.
- 2026-09-19 · Renaming a seeded row: seed is idempotent BY NAME, so a plain rename in `seed-skills.ts` gives existing DBs a duplicate. Add the old→new pair to `RENAMED_SEED_SKILLS` (`server/src/db/seed-skills.ts`); `seed()` renames the old row in place first, keeping its id, links and versions.

## Tool & Library Notes

- 2026-09-19 · dependency-cruiser config traps here: (1) pnpm resolves to `node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>/…`, so `^node_modules/drizzle-orm/` never matches — use `(^|/)node_modules/`. (2) Adding `types` to `enhancedResolveOptions.conditionNames` resolves packages to `.d.ts`, which the `\.d\.ts$` exclude then drops: every `drizzle-orm` edge silently vanished and the rules looked clean. `import` IS needed, or ESM-only `octokit`/`p-queue` go unresolvable. (3) A package a ring doesn't install (e.g. `drizzle-orm` from `reviewer-core`) is unresolvable, so path rules can't see it — `not-to-unresolvable` catches it. Prove each new rule with a throwaway violating file. `server/.dependency-cruiser.cjs:1`.
- 2026-09-19 · `drizzle-kit generate` hangs forever (no output, 120s tool timeout) when one migration both DROPS a column and ADDS others on the same table: it opens an interactive "created or renamed from `accepted`?" prompt a non-TTY run can't answer. Split it — keep the old column and generate (adds only), then remove it and generate again (drop only) — and run with `</dev/null` in the background so a prompt can't block the shell. `server/src/db/migrations/0014_chubby_hercules.sql:1`. → now a rule in server/AGENTS.md.

## Recurring Errors & Fixes

- 2026-09-19 · A new migration whose objects the shared `devdigest_pgdata` volume ALREADY has (from the reverted integration branch) breaks every other worktree's `db:migrate` → make it idempotent: generate with drizzle-kit, then hand-edit to `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` and wrap `ADD CONSTRAINT` in `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = …)`. Check first with `\d <table>` in the container. Root cause compounder: the drizzle migrator applies by journal TIMESTAMP, not hash, and the shared DB's last applied row predates 0010/0011, so it replays them too. `server/src/db/migrations/0012_loose_texas_twister.sql:1`. → now a rule in server/AGENTS.md.
- 2026-09-19 · Flaky `/runs/:id/trace` read right after `waitForPrRuns` (passed 3/3 alone, failed ~1 in 2 full runs) → also wait on the trace row with `waitForRunTrace(db, runId)` (`server/test/helpers/runs.ts`). Root cause: `run-executor` calls `completeAgentRun` (status `done`, what the helper waits for) BEFORE `saveRunTrace`. `server/src/modules/reviews/run-executor.ts:252`.
- 2026-09-19 · A list endpoint reshuffling after every edit → give every list query a stable ORDER BY. Root cause: Postgres returns heap order and an UPDATE (even just toggling `enabled`) writes a new row version, so the edited row jumps to the end. `AgentsRepository.list` was the case (the agents rail reordered on every toggle); it now orders by `createdAt, id`. `server/src/modules/agents/repository.ts:1` (`list`).
- 2026-09-19 · `Test Files 30 passed | 2 skipped` with a green exit ≠ green → always check the skipped count, not the exit code. Root cause: `dockerAvailable()` intermittently returns false and `*.it.test.ts` files self-skip; the re-run was 32/32. `server/test/helpers/pg.ts:1` (`dockerAvailable`). → now a rule in server/AGENTS.md.

## Session Notes

- 2026-09-17 · Run Cost server side + drizzle skill review; shipped the `agent_runs` index as migration 0011 — +2 insights
- 2026-09-19 · Onboarding Q&A on pgvector/embeddings; planned + built the onion-architecture skill and `arch:check`; planned and ran the backend refactor (`pulls` → service/repository/ports, list rollups to SQL) — +6 insights
- 2026-09-19 · Skills module, agent skill links and prompt wiring (migration 0012 made idempotent); Conventions extractor (migrations 0013/0014, real scan on dev-digest: 12 grounded, $0.0009) — +4 insights
- 2026-09-20 · Compacted this file (supersede chains collapsed, no facts dropped); promoted 4 entries to server/AGENTS.md — +0 insights

## Open Questions
