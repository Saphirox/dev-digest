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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-09-17 · Run Cost server side + drizzle skill review — +1 insight (Codebase Patterns)
- 2026-09-17 · Shipped the agent_runs index as migration 0011 — +1 insight (Codebase Patterns, superseding line)
- 2026-09-19 · Onboarding Q&A on pgvector/embeddings (no code changes) — +2 insights (Codebase Patterns)

## Open Questions
