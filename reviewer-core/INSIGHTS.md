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

- 2026-09-21 · When a prompt change must leave the no-intent prompt byte-identical, pin it with a HAND-WRITTEN literal golden test (`toBe('sys\n\n' + <INJECTION_GUARD text copied by hand>)`), never `toMatchInlineSnapshot` — a snapshot silently re-baselines if the shared `INJECTION_GUARD` drifts, which is exactly the regression it must catch. Keep the typographic apostrophe in `finding’s`. `reviewer-core/test/prompt.test.ts` ("no-intent prompt is byte-identical").
- 2026-09-21 · `INTENT_SCOPE_RULE` (trusted, in the USER message) grants a permission the shared `INJECTION_GUARD` (in the SYSTEM message) nominally forbids — "derived intent/scope … NEVER reduce, waive, or descope". They don't strictly contradict (the guard's operative clause is about real defects; the rule permits omitting only SUGGESTIONs), but the system message usually wins, so the model may simply NOT use the permission. That fails safe (more suggestions, never a lost defect). Only the live A/B (`docs/specs/intent-layer.md`, kill criterion) shows which way a given model resolves it; moving the permission into the system message would break the byte-identical no-intent prompt.

## Tool & Library Notes

- 2026-09-20 · `reviewer-core/tsconfig.json` has `include: ["src/**/*.ts"]`, so `pnpm typecheck` (`tsc --noEmit -p tsconfig.json`) never type-checks `test/**`. A wrong prop passed to e.g. `assemblePrompt` in a test surfaces only when vitest runs it, not in typecheck — "tsc passes clean" says nothing about test files. `reviewer-core/tsconfig.json:29`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
