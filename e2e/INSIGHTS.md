# e2e — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's AGENTS.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-17 · Two hard limits on what the seeded data can prove about findings: PR #482 has exactly one CRITICAL + one WARNING and **no SUGGESTION**, and its review has `run_id = NULL`, so nothing that keys off a run's findings shows anything. `04-pr-findings.flow.json` asserts the literal "2 findings", so do NOT edit the seed to make a feature demoable — adjust the local dev DB and revert. `server/src/db/seed.ts:136-175`.
- 2026-09-17 · The runner's deterministic verbs are `open` / `wait --url` / `wait --text` / `find role|text|label [click]` — **there is no hover**. A hover-only affordance cannot be covered here at all; leave it to the vitest suite rather than writing a flow whose assertions would hold with the feature ripped out. Verbs documented at `e2e/README.md:28`; runner at `e2e/run.ts:63`.

## Tool & Library Notes

- 2026-09-29 · `agent-browser` is a GLOBAL install (`npm i -g agent-browser && agent-browser install`, which also downloads Chrome) and is absent on a fresh machine, so `npm run e2e:hermetic` can't run without the user agreeing to that install. The fallback used for plan 0013 (a backend-only refactor): boot the API on a spare port (`API_PORT=3291 WEB_PORT=3290 ./node_modules/.bin/tsx src/server.ts` in `server/`) and curl every endpoint the 7 flows read (`/repos`, `/repos/:id/pulls`, `/pulls/:id{,/runs,/reviews}`, `/agents`, `/settings`, `/settings/secrets-status`). That is an API smoke test, not the flows, and should be reported that way. Stop the API by port (`lsof -nP -iTCP:3291 -sTCP:LISTEN -t`). `scripts/e2e.sh:49`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
