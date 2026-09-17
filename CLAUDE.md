# DevDigest

Local-first AI pull-request review. Course starter: import a PR → run an agent
review on it. Full picture: [README.md](README.md).

## Stack

Node ≥22 · pnpm ≥10 · Docker (Postgres/pgvector). 4 standalone packages, **no
pnpm workspace** — each has its own `package.json`/lockfile, linked via
tsconfig path aliases, not npm.

## Run

```sh
./scripts/dev.sh                              # Postgres + API :3001 + web :3000
cd server && pnpm db:migrate && pnpm db:seed  # NOT run automatically on boot
```

## Repo map

| Module | Package | Role | Details |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify + Drizzle/Postgres API | [server/CLAUDE.md](server/CLAUDE.md) |
| `client/` | `@devdigest/web` | Next.js 15 studio UI | [client/CLAUDE.md](client/CLAUDE.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | diff→prompt→LLM→findings engine | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| `e2e/` | `@devdigest/e2e` | deterministic browser e2e | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

`repo-intel` (codebase indexer) lives *inside* `server/src/modules/repo-intel`,
not a separate package.

## Non-default conventions

- `@devdigest/shared` contracts: canonical copy is `server/src/vendor/shared`;
  `reviewer-core` aliases straight to it via tsconfig. `client/src/vendor/shared`
  is a **separate, manually-synced copy** that can drift — diff before trusting
  it matches server.
- Secrets (LLM keys, `GITHUB_TOKEN`) live in `~/.devdigest/secrets.json`
  (mode 0600) — never in `.env`, git, or the DB.
- The DB schema already has every future course-lesson's tables pre-created;
  unused ones just sit empty until that lesson's code fills them — don't
  "clean up" what looks unused.
- Migrations are **not** applied on boot — `cd server && pnpm db:migrate`.

## Do not touch

- `server/src/vendor/shared/**` and `client/src/vendor/shared/**` — hand-vendored,
  not generated; if you edit contracts, update both sides deliberately.
- Merged files under `server/src/db/migrations/` — immutable; add a new
  migration rather than editing an old one.
- `e2e/specs/*.flow.json` and the `devdigest_pgdata` Docker volume — see
  [e2e/CLAUDE.md](e2e/CLAUDE.md) before touching either.

## Insights loop — mandatory

Every module (`client`, `server`, `reviewer-core`, `repo-intel`, `e2e`) keeps
an append-only `INSIGHTS.md`; cross-cutting lessons live in the root
[INSIGHTS.md](INSIGHTS.md). None are auto-loaded — they're read on demand,
lazily (section map first, then only what the task needs). Routing, reading
strategy, format, and quality bar: the `engineering-insights` skill.

1. **Start of every task** — after the user's prompt and before exploring,
   editing, or answering, read the `INSIGHTS.md` of every module the prompt
   concerns (questions and reviews included, not only code changes); add the
   root one when the task spans modules or touches `scripts/`, Docker, CI, or
   `.claude/`. Say in one line which entries apply, or that none do.
2. **End of every task** — run the `engineering-insights` wrap-up: re-read
   the target `INSIGHTS.md`, then append only substantive insights it doesn't
   already contain. Nothing new → write nothing.

## Docs

[TESTING.md](TESTING.md) · [docs/agent-prompts/](docs/agent-prompts/) — the
built-in reviewer agent system prompts.
