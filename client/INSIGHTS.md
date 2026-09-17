# client — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's CLAUDE.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-16 · Adding a column to the PR list means editing THREE unlinked places or the headers silently desync from the cells: `GRID` (`pulls/constants.ts:26`), `COLUMN_KEYS` (same file, drives only the header row) and the JSX cells in `PRRow.tsx`. Nothing in code ties the key list to the cell order — they just share one `gridTemplateColumns`.
- 2026-09-17 · In the run-usage UI, null and 0 mean different things for BOTH fields, not just cost: unknown cost renders "—" (`lib/format-usd.ts`, `formatUsd`) and unknown tokens must DROP the whole "N tok · " segment. Never normalise with `?? 0` when feeding `RunCostBadge` — `(r.tokens_in ?? 0) + (r.tokens_out ?? 0)` made a run with a known cost but unrecorded tokens claim "0 tok". Guarded by "does not claim '0 tok'" in `RunHistory.test.tsx`.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-09-16 · Spec for the Run Cost feature (3 screens) — mapped the client touch points; +1 insight (Codebase Patterns)
- 2026-09-17 · Run Cost UI + react-best-practices review pass — found and fixed the "0 tok" bug; +1 insight (Codebase Patterns)

## Open Questions
