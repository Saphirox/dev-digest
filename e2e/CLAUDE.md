# e2e — `@devdigest/e2e`

Deterministic browser e2e for the web app, driven by Vercel **agent-browser**
(native Rust+CDP CLI). **No Playwright, no LLM, no API key.** Full picture:
[README.md](README.md).

## Stack

`agent-browser` is a CLI, not a test framework — this package's only
convention is `run.ts`, which plays a flow (a JSON list of `agent-browser`
commands) against one shared browser session.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once, downloads Chrome for Testing
./scripts/e2e.sh          # hermetic: isolated stack (PG :5433, API :3101, web :3100)
cd e2e && npm test         # against your own running dev stack — see gotcha below
```

## Map

- `specs/NN-name.flow.json` — one flow per file: `{ name, steps: [{ cmd,
  label }], assert? }`. `{BASE}` → `E2E_BASE_URL`. **This `specs/` holds test
  flows, not product specs** — see root [CLAUDE.md](../CLAUDE.md), no
  `product-specs/` was added here to avoid the name clash.
- `run.ts` — the flow runner.
- `lib/` — runner internals.

## Non-default conventions

- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  Never use the AI `chat` command — runs must stay stable and key-free.
- A non-zero exit from any `cmd` fails the step and the flow, so `wait --text`
  / `wait --url` **are** the assertions — there's no separate assert-only step
  for the common case.
- Flows target read-only seeded data (`acme/payments-api`, PR #482) — nothing
  here triggers a real model call.

## Gotchas

- **Don't run `npm test` against your normal dev DB** unless it contains
  *only* the seeded demo repo — flow `02` follows the home redirect to the
  *first* repo and assumes it's the only one. Use `./scripts/e2e.sh`
  (hermetic, isolated Postgres on :5433) instead; it's safe to run alongside
  your normal dev stack.
- **Never `docker compose down -v`** to "reset" — `-v` deletes the
  `devdigest_pgdata` volume, wiping every real repo/review you've imported,
  not just e2e state.
- Failure screenshots land in `e2e/test-results/` (git-ignored, uploaded as a
  CI artifact by `e2e-web.yml`).

## Do not touch

- `specs/*.flow.json` step ordering — flows run sequentially in one shared
  browser session; reordering can break later steps' assumed page state.

## Docs

[README.md](README.md) (flow anatomy + coverage table) · [docs/](docs/) ·
[INSIGHTS.md](INSIGHTS.md) · [../TESTING.md](../TESTING.md)

## Insights

Lessons from past sessions: [INSIGHTS.md](INSIGHTS.md). If you haven't
read it in this task yet, read it now — before changing or explaining
anything here (see *Insights loop* in the root [CLAUDE.md](../CLAUDE.md)).
