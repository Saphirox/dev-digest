# reviewer-core — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's AGENTS.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-16 · Run cost is all-or-nothing across map-reduce chunks: one chunk returning `costUsd: null` nulls the WHOLE run, by design — a partial sum would understate the price. Don't "fix" it into a partial total. `reviewer-core/src/review/run.ts:184` (`reviewPullRequest`); per-call source chain is `usage.cost` → injected `estimateCost` at `src/llm/openrouter.ts:110`.
- 2026-09-19 · `assemblePrompt` already accepts and renders `parts.memory`/`parts.specs` (string arrays → `## Relevant memory`/`## Project context` sections); the server just never populates them yet. A future memory/RAG or semantic-search feature needs only server-side retrieval + wiring into `run-executor.ts`, not changes here. `reviewer-core/src/prompt.ts:44-45,90-93,110,114`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-09-16 · Traced the cost path for the Run Cost spec — engine needs no changes; +1 insight (Codebase Patterns)
- 2026-09-19 · Onboarding Q&A on pgvector/embeddings (no code changes) — +1 insight (Codebase Patterns)

## Open Questions
