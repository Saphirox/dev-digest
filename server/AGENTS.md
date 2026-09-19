# server — `@devdigest/api`

Fastify + Drizzle/Postgres backend: imports repos/PRs, indexes with
`repo-intel`, runs `reviewer-core`. Full picture: [README.md](README.md).

## Stack

Fastify 5 (`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`,
`fastify-sse-v2` for run traces), Drizzle ORM, `postgres`, pgvector. Zod
contracts from `src/vendor/shared` drive both request validation and response
serialization (`fastify-type-provider-zod`) — one schema, no hand-rolled
`Schema.parse(req.body)`.

## Commands

```sh
pnpm dev            # API on :3001, no keys required to boot
pnpm db:migrate      # apply migrations (NOT run on boot)
pnpm db:seed         # idempotent demo data
pnpm test            # unit + integration (see below)
pnpm typecheck
```

## Map

- `src/modules/<name>/` — one Fastify plugin per feature (`repos`, `pulls`,
  `polling`, `reviews`, `agents`, `repo-intel`, `settings`, `workspace`),
  registered statically in `src/modules/index.ts`.
- `src/adapters/` — ports behind the DI container (llm, github, git, astgrep,
  embedder, tokenizer, secrets); swapped for `src/adapters/mocks.ts` in tests.
- `src/platform/` — config (`config.ts`, every secret optional) + DI container.
- `src/db/` — Drizzle schema + migrations.
- `src/vendor/shared` — canonical `@devdigest/shared` contracts (see root
  [AGENTS.md](../AGENTS.md) do-not-touch note).

## Non-default conventions

- No keys required to boot — `loadConfig` marks every secret optional; set
  keys via Settings UI or `server/.env` at runtime.
- Secrets never touch `AppConfig`/DB — only `LocalSecretsProvider`
  (`src/adapters/secrets/local.ts`) reads `~/.devdigest/secrets.json`.
  `GITHUB_TOKEN` is canonical, `GITHUB_PAT` is a fallback.
- Plugins register **before** modules so encapsulated module plugins inherit
  helmet/cors/rate-limit/SSE and the shared error handler.
- Global rate limit 120/min (off under `NODE_ENV=test`), tighter caps on
  expensive routes (e.g. `POST /pulls/:id/review`); SSE and `/health*` exempt.

## Gotchas

- **Repo Intel degrades silently.** `REPO_INTEL_ENABLED` defaults to `true`,
  but repo-map/blast-radius sections only populate once the repo is
  *indexed* — an unindexed repo silently falls back to diff-only context.
- **Prompt-injection defense is one shared rule, not keyword-scanning.** The
  `INJECTION_GUARD` in `reviewer-core/prompt.ts` tells the model untrusted PR
  content is data, never instructions; "intentional/test/do not flag" claims
  never descope severity. Don't add a denylist alongside it.
- **Grounding is mandatory.** Every finding must cite a real diff line
  (`groundFindings`) or it's dropped; the score is recomputed from surviving
  findings, never trusted from the model.
- DB-backed tests **must** be named `*.it.test.ts` (testcontainers Postgres,
  self-skip without Docker) or the unit/integration split breaks.

## Do not touch

- `src/vendor/shared/**` — canonical shared contracts; edits here must be
  mirrored to `client/src/vendor/shared` (see root AGENTS.md).
- Merged files in `src/db/migrations/` — add a new migration instead.

## Docs

[README.md](README.md) (deep API/DI diagrams) · [docs/](docs/) ·
[specs/](specs/) · [INSIGHTS.md](INSIGHTS.md) · [../TESTING.md](../TESTING.md)

## Insights

Lessons from past sessions: [INSIGHTS.md](INSIGHTS.md). If you haven't
read it in this task yet, read it now — before changing or explaining
anything here (see *Insights loop* in the root [AGENTS.md](../AGENTS.md)).
