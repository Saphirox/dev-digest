# server — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's AGENTS.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-17 · `agentRuns` declares NO index in this branch (`server/src/db/schema/runs.ts`), while most other tables do (`repos`, `pulls`, `memory`, `jobs`, `code_chunks`, `symbols`, …) — yet both hot reads order by it: `listRunsForPull` (`modules/reviews/repository/run.repo.ts:44`) and the PR-list cost aggregation (`modules/pulls/routes.ts`, `latestCostByPr`). The shared live DB already carries `agent_runs_pr_ran_at_idx btree (pr_id, ran_at DESC NULLS LAST)` from the reverted integration branch, i.e. that branch hit the need in practice — so adding it back is a known-good move, not speculation.
- 2026-09-17 · Supersedes 2026-09-17 "`agentRuns` declares NO index": done — the index is now declared in `server/src/db/schema/runs.ts` (`prRanAtIdx`) and shipped as migration `0011_petite_molecule_man.sql`. Don't re-add it. `server/src/db/schema/runs.ts:1` (`prRanAtIdx`).
- 2026-09-19 · `memory.embedding`/`code_chunks.embedding` (`vector(1536)`) are schema+adapter-only: grepped `modules/` and `adapters/` for `cosineDistance`/`<=>`/`embedding` usage and found zero write or query code anywhere — the feature is fully gated behind `EMBEDDINGS_ENABLED` (default false) and no HNSW/ivfflat index exists on either column (only btree on `workspaceId`/`repoId`). Add one before any real similarity query. `server/src/db/schema/context.ts:43`, `server/src/db/schema/knowledge.ts:21`.
- 2026-09-19 · Any embeddings feature needs `OPENAI_API_KEY` regardless of which provider the review agents use: `Embedder` has exactly one real implementation, `OpenAIEmbedder`, and Anthropic has no embeddings API (throws if called). `container.embedder()` has no Anthropic/OpenRouter fallback. `server/src/adapters/embedder/openai.ts:7`, `server/src/adapters/llm/anthropic.ts:19,154`, `server/src/platform/container.ts:195`.
- 2026-09-19 · Layering baseline is now machine-checked: `.dependency-cruiser.cjs` + `arch:check` → **0 errors / 29 warnings**. Warnings are known debt (routes in `pulls`/`polling`/`workspace`/`settings` query Drizzle via `container.db`, e.g. `src/modules/pulls/routes.ts:241`; `repo-intel` pipeline imports concrete `adapters/*`; `service ↔ container` type cycles). There is still zero `db.transaction(` in `src/`: the first multi-write use case should follow the skill's `UnitOfWork` + `DbExecutor` pattern. A rising warning count = new debt. Details: `.claude/skills/onion-architecture/references/layers-and-dependency-rule.md`. `server/.dependency-cruiser.cjs:1`.
- 2026-09-19 · `reviews` and `findings` declare NO index (`server/src/db/schema/reviews.ts:9,28`), yet the PR-list FINDINGS column joins `findings.review_id → reviews.id` filtered by `reviews.pr_id IN (…)` on every list load (`modules/pulls/routes.ts`, `findingsByPr`). Same situation `agent_runs` was in before `0011`: add `reviews(pr_id, …)` + `findings(review_id)` in a new migration before this query grows.
- 2026-09-19 · Moving the PR-list cost total into SQL is semantics-safe: Postgres `SUM(cost_usd)` already skips NULLs and returns NULL when every input is NULL, and a PR with no `done` runs yields no group, i.e. exactly the "null = unknown, never 0" rule the JS loop in `pulls/routes.ts` hand-implements. Drizzle's `sum()` returns a string: use `.mapWith(Number)` and keep `pulls-cost-total.it.test.ts` as the guard. `server/test/pulls-cost-total.it.test.ts:1`.
- 2026-09-19 · Supersedes 2026-09-19 "Layering baseline … 29 warnings": `pulls` now has the full `routes → service → repository` split with a `PullsStore` port in `ports.ts`, and the baseline is **0 errors / 27 warnings**. Its `replaceDetail` (delete + insert `pr_files`/`pr_commits`, then update the PR) is still unwrapped, so it's the natural first `UnitOfWork` use case. `server/src/modules/pulls/repository.ts:1`.

## Tool & Library Notes

- 2026-09-19 · dependency-cruiser config traps in this repo: (1) pnpm resolves to `node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>/…`, so `^node_modules/drizzle-orm/` never matches; use `(^|/)node_modules/`. (2) Adding `types` to `enhancedResolveOptions.conditionNames` resolves packages to `.d.ts`, which the `\.d\.ts$` exclude then drops. Every `drizzle-orm` edge silently vanished and the rules looked clean. `import` IS needed, or ESM-only `octokit`/`p-queue` go unresolvable. (3) A package a ring doesn't install (e.g. `drizzle-orm` from `reviewer-core`) is unresolvable, so path rules can't see it; `not-to-unresolvable` catches it. Prove each new rule with a throwaway violating file. `server/.dependency-cruiser.cjs:1`.

## Recurring Errors & Fixes

## Session Notes

- 2026-09-17 · Run Cost server side + drizzle skill review — +1 insight (Codebase Patterns)
- 2026-09-17 · Shipped the agent_runs index as migration 0011 — +1 insight (Codebase Patterns, superseding line)
- 2026-09-19 · Onboarding Q&A on pgvector/embeddings (no code changes) — +2 insights (Codebase Patterns)
- 2026-09-19 · Planned an onion-architecture skill (research only, no code) — +1 insight (Codebase Patterns)
- 2026-09-19 · Built the onion-architecture skill + `arch:check` — 1 insight rewritten (Codebase Patterns), +1 (Tool & Library Notes)
- 2026-09-19 · Planned the backend refactor of the branch's changes (plan only, no code) — +2 insights (Codebase Patterns)
- 2026-09-19 · Refactored `pulls` into service/repository/ports + moved list rollups to SQL — +1 insight (Codebase Patterns, superseding line)

## Open Questions
