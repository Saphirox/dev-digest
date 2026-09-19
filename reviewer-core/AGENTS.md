# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: **diff → prompt → LLM → grounded findings**. No database,
GitHub, or filesystem access. Full picture: [README.md](README.md).

## Stack

TypeScript, Zod. Single side effect: an LLM call through an **injected**
`LLMProvider` — that's what makes the engine mock-testable. `server`
(`@devdigest/api`) is the only consumer in the starter, via a tsconfig path
alias, consuming this package's TS **source** directly (no build step).

## Commands

```sh
npm test         # vitest — hermetic, stubbed LLMProvider, no keys/network
npm run typecheck  # doubles as the "build" — this package never emits JS
```

## Map

- `src/review/` — orchestration (`run.ts`, single-pass by default) +
  `prompt.ts` (`assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`) +
  `grounding.ts` (`groundFindings`, `groundingSummary`).
- `src/llm/` — `LLMProvider` interface + `openrouter.ts` implementation.
- `src/output/` — `structured.ts` (Zod → JSON Schema, `parseWithRepair`).
- `src/index.ts` — the public API surface; contracts (`Review`, `Finding`,
  `Verdict`, …) come from `@devdigest/shared`.

## Non-default conventions

- Never add DB/filesystem/GitHub access here — if a feature needs it, it
  belongs in `server`, which passes the result in as a plain input.
- The engine already accepts optional prompt slots later course lessons feed
  (`skills`, `memory`, `specs`, `callers`) — in the starter the server omits
  them and `assemblePrompt` just leaves those sections out. Don't delete the
  slots; they're not dead code.
- `build` = typecheck only. There is no `dist/`; don't add a bundler step.

## Gotchas

- **Grounding is the mandatory gate**, not a nice-to-have: a finding without
  a real diff-line citation is dropped by `groundFindings`, and the score is
  recomputed from the survivors — never trust the model's self-reported score.
- **`INJECTION_GUARD` is one shared rule appended to every agent's system
  prompt**, not text parsing/keyword-scanning. Untrusted PR content (diff,
  README, comments) is fenced via `wrapUntrusted()` and marked as data, never
  instructions — don't add a denylist alongside it.

## Do not touch

- Don't hand-edit `@devdigest/shared` contracts from here — this package only
  consumes them (aliased to `server/src/vendor/shared`, see root
  [AGENTS.md](../AGENTS.md)).

## Docs

[README.md](README.md) (pipeline diagram) · [docs/](docs/) · [specs/](specs/) ·
[INSIGHTS.md](INSIGHTS.md) · [../TESTING.md](../TESTING.md)

## Insights

Lessons from past sessions: [INSIGHTS.md](INSIGHTS.md). If you haven't
read it in this task yet, read it now — before changing or explaining
anything here (see *Insights loop* in the root [AGENTS.md](../AGENTS.md)).
