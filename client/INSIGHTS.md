# client — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's CLAUDE.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-09-16 · Adding a column to the PR list means editing THREE unlinked places or the headers silently desync from the cells: `GRID` (`pulls/constants.ts:26`), `COLUMN_KEYS` (same file, drives only the header row) and the JSX cells in `PRRow.tsx`. Nothing in code ties the key list to the cell order — they just share one `gridTemplateColumns`.
- 2026-09-17 · In the run-usage UI, null and 0 mean different things for BOTH fields, not just cost: unknown cost renders "—" (`lib/format-usd.ts`, `formatUsd`) and unknown tokens must DROP the whole "N tok · " segment. Never normalise with `?? 0` when feeding `RunCostBadge` — `(r.tokens_in ?? 0) + (r.tokens_out ?? 0)` made a run with a known cost but unrecorded tokens claim "0 tok". Guarded by "does not claim '0 tok'" in `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:1`.

- 2026-09-17 · Grep `src/vendor/ui` before styling new UI, but reuse its **tokens** before its components: `SEV[x].c` / `SEV[x].icon` (`primitives/tokens.ts:6`) carry the right colour and glyph for any severity UI, while the matching components bake in chrome you may not want. The timeline chips needed the tokens but NOT `SeverityBadge` (`primitives/Badge.tsx:52`), which unconditionally draws a filled pill — `background: SEV[x].bg` + `padding` + `borderRadius` + `uppercase` — and exposes no variant prop; the design wanted a bare icon+number with a dotted underline, so the chip had to be local. Corroborating leftovers nearby: `FindingsPanel/styles.ts` still declares an unused `divider`, and `Chip` is referenced only by `FilterBar` + the showcase.
- 2026-09-17 · `FindingsTab`'s two run props are different types and trivially swapped: `runs` is `ReviewRecord[]` (reviews, each WITH `findings` and a `run_id`) while `prRuns` is `RunSummary[]` (the timeline). Anything per-severity must read `runs` and join by `run_id` — `RunSummary` carries only `findings_count`/`blockers`, never a severity breakdown (`contracts/trace.ts:99-121`). `_components/FindingsTab/FindingsTab.tsx:17-18`.
- 2026-09-17 · The seeded review has **`run_id = NULL`** (`server/src/db/seed.ts:136-148` never sets it), and every real `agent_runs` row in the shared dev DB has 0 findings — so anything that joins reviews to timeline runs by `run_id` renders its fallback path and looks broken on seeded data. To see the timeline severity chips, temporarily `UPDATE findings SET review_id=<a review that HAS a run_id>` and put it back after; don't "fix" the seed (`e2e/INSIGHTS.md` explains why).

## Tool & Library Notes

- 2026-09-17 · There is no popover/tooltip/hovercard primitive anywhere in `client/src` (and no floating-ui/radix dep) — a hover card has to be hand-rolled. The pattern that works against the timeline's own `overflow`: `position: fixed` anchored to `e.currentTarget.getBoundingClientRect()` captured on `onMouseEnter`, clamped with `Math.min(rect.left, window.innerWidth - width)`. Keep the card a DOM child of the hovered element — `onMouseLeave` follows DOM containment, not visual position, so the pointer can travel into a fixed-positioned child without dismissing it. `client/src/components/findings-preview/styles.ts:8` (`card`).

- 2026-09-17 · `ConfidenceNum` (`primitives/ConfidenceNum.tsx:8`) hardcodes `title="Model confidence"` and offers no prop to suppress it. Dropped onto a non-interactive surface such as a hover card, that lone `title` is enough for the browser to show a help/"?" cursor there — reported as a bug by the user, and confirmed by measuring: every element computed `cursor: default` and the repo contains no `cursor: help` at all, so the `title` was the only candidate. When a design needs the visual without the tooltip, duplicate its ~8 lines locally (`vendor/ui` is off-limits) and leave a comment saying why. Corollary: name chips with `aria-label`, never `title`. Guarded by "puts no title anywhere in the hover card" in `RunHistory.test.tsx`.

## Recurring Errors & Fixes

## Session Notes

- 2026-09-16 · Spec for the Run Cost feature (3 screens) — mapped the client touch points; +1 insight (Codebase Patterns)
- 2026-09-17 · Run Cost UI + react-best-practices review pass — found and fixed the "0 tok" bug; +1 insight (Codebase Patterns)
- 2026-09-17 · Per-severity chips + hover findings preview on the PR timeline (client-only, no model call) — +5 insights (Codebase Patterns ×3, Tool & Library Notes ×2)

## Open Questions
