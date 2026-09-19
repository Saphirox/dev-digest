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

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Package name | `@devdigest/<short>` — not the folder name | `server/` → `@devdigest/api`, `client/` → `@devdigest/web` |
| Server module | one folder per feature under `src/modules/<feature>/`, registered in `modules/index.ts` | `modules/reviews/routes.ts` |
| Adapter | `src/adapters/<port>/<impl>.ts`, port name singular | `adapters/llm/openrouter.ts`, `adapters/secrets/local.ts` |
| DB schema | one file per domain in `src/db/schema/<domain>.ts`; shared columns in `_shared.ts` | `schema/runs.ts` |
| Migration | `NNNN_<snake_case>.sql`, 4-digit sequential prefix, drizzle-generated name — never renumbered | `0011_petite_molecule_man.sql` |
| Contract | zod schema and its inferred type share one name | `export const PrMeta = z.object({…})` + `export type PrMeta = z.infer<typeof PrMeta>` |
| Client route | `src/app/**/page.tsx`; pages stay thin | `app/repos/[repoId]/pulls/[number]/page.tsx` |
| Client feature component | colocated folder `_components/<Name>/` holding `<Name>.tsx` + optional `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, `<Name>.test.tsx` | `_components/FindingCard/` |
| Cross-route component | `src/components/<kebab-name>/` | `components/findings-preview/` |
| Client test | colocated `<Name>.test.tsx` beside the component | `FindingCard.test.tsx` |
| Server test | lives in `server/test/`, **not** beside the source | `test/reviews-helpers.test.ts` |
| Server DB-backed test | **must** end `.it.test.ts` or the unit/integration split breaks | `test/agents-versions.it.test.ts` |
| e2e flow | `e2e/specs/NN-name.flow.json` | `04-pr-findings.flow.json` |
| i18n | one namespace file per feature area, keys addressed by dot path | `messages/en/prReview.json` → `t("list.columns.cost")` |
| Severity CSS token | `--<sev>` plus a `--<sev>-bg` tint | `--crit` / `--crit-bg` |

## Do not touch

- `server/src/vendor/shared/**` and `client/src/vendor/shared/**` — hand-vendored,
  not generated; if you edit contracts, update both sides deliberately.
- Merged files under `server/src/db/migrations/` — immutable; add a new
  migration rather than editing an old one.
- **Lock files** — `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`. Never hand-edit
  one, and never cross the package managers: `server`/`client` are pnpm,
  `reviewer-core`/`e2e` are npm. Running `pnpm install` inside an npm package
  silently writes a competing `pnpm-lock.yaml` (and a stray
  `pnpm-workspace.yaml`) — check `git status` before committing.
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
