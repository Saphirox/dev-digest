# e2e — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's CLAUDE.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-17 · Two hard limits on what the seeded data can prove about findings: PR #482 has exactly one CRITICAL + one WARNING and **no SUGGESTION**, and its review has `run_id = NULL`, so nothing that keys off a run's findings shows anything. `04-pr-findings.flow.json` asserts the literal "2 findings", so do NOT edit the seed to make a feature demoable — adjust the local dev DB and revert. `server/src/db/seed.ts:136-175`.
- 2026-09-17 · The runner's deterministic verbs are `open` / `wait --url` / `wait --text` / `find role|text|label [click]` — **there is no hover**. A hover-only affordance cannot be covered here at all; leave it to the vitest suite rather than writing a flow whose assertions would hold with the feature ripped out. Verbs documented at `e2e/README.md:28`; runner at `e2e/run.ts:63`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-09-17 · Timeline severity chips + hover preview — no flow added (hover unsupported); +2 insights (Codebase Patterns)

## Open Questions
