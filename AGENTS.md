# DevDigest

Local-first AI pull-request review. Course starter: import a PR → run an agent
review on it. Full picture: [README.md](README.md).

## Stack

Node ≥22 · pnpm ≥10 · Docker (Postgres/pgvector). 5 standalone packages, **no
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
| `server/` | `@devdigest/api` | Fastify + Drizzle/Postgres API | [server/AGENTS.md](server/AGENTS.md) |
| `client/` | `@devdigest/web` | Next.js 15 studio UI | [client/AGENTS.md](client/AGENTS.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | diff→prompt→LLM→findings engine | [reviewer-core/AGENTS.md](reviewer-core/AGENTS.md) |
| `e2e/` | `@devdigest/e2e` | deterministic browser e2e | [e2e/AGENTS.md](e2e/AGENTS.md) |
| `mcp/` | `@devdigest/mcp` | stdio MCP server over the API | [mcp/AGENTS.md](mcp/AGENTS.md) |

`repo-intel` (codebase indexer) lives *inside* `server/src/modules/repo-intel`,
not a separate package.

## Non-default conventions

- Agent instructions live in `AGENTS.md` (root and each module). Every
  `CLAUDE.md` is a relative **symlink** to its sibling `AGENTS.md`, for Claude
  Code — edit `AGENTS.md`, never the symlink, and link to `AGENTS.md` in docs.
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
- **Shared state moves under you.** Other sessions edit this worktree and
  re-run reviews against the shared dev DB mid-task. Re-read a file and
  re-query `reviews`/`findings` rows immediately before a plan, a review
  finding or a verification step relies on them, and run
  `git rev-parse --abbrev-ref HEAD` before committing.
- **Design precedence:** grading rubric > design screenshot or reverted
  feature commit > written brief. Before building UI, ask for the screenshot
  — a text-only description has been misread more than once.

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Package name | `@devdigest/<short>` — not the folder name | `server/` → `@devdigest/api`, `client/` → `@devdigest/web` |
| Server module | one folder per feature under `src/modules/<feature>/`, registered in `modules/index.ts` | `modules/reviews/routes.ts` |
| Adapter | `src/adapters/<port>/<impl>.ts`, port name singular | `adapters/llm/openrouter.ts`, `adapters/secrets/local.ts` |
| DB schema | one file per domain in `src/db/schema/<domain>.ts`; shared columns in `_shared.ts` | `schema/runs.ts` |
| Migration | `NNNN_<snake_case>.sql`, 4-digit sequential prefix, drizzle-generated name — never renumbered | `0011_petite_molecule_man.sql` |
| Feature spec | `specs/spec-NNNN-<slug>.md` at the repo root, flat (modules go in the `Modules:` header, not the path), one 4-digit `NNNN` sequence, never renumbered; written by the `spec-creator` agent before planning — see [specs/README.md](specs/README.md) | `specs/spec-0001-blast-radius.md` |
| Plan | `docs/plans/NNNN-<slug>.md`, 4-digit sequential prefix, never renumbered | `docs/plans/0001-helper-agent-set.md` |
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
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`,
  `mcp/package-lock.json`. Never hand-edit one, and never cross the package
  managers: `server`/`client` are pnpm, `reviewer-core`/`e2e`/`mcp` are npm.
  Running `pnpm install` inside an npm package silently writes a competing
  `pnpm-lock.yaml` (and a stray `pnpm-workspace.yaml`) — check `git status`
  before committing.
- `e2e/specs/*.flow.json` and the `devdigest_pgdata` Docker volume — see
  [e2e/AGENTS.md](e2e/AGENTS.md) before touching either.

## Feature pipeline

For a new feature or behaviour change, first **ask the user which
profile** to run — never pick it yourself:

- **full** — every step below;
- **lite** — spec → plan → implement → test → verify, without asking
  about `investigator`/`brainstorm` and without the architecture review;
- **no spec** — `implementation-planner` straight from the task (small,
  well-understood changes).

Then run the agents in this order:

1. **Spec phase.** `spec-creator` writes a `draft`
   `specs/spec-NNNN-<slug>.md`. While it is a draft, **ask the user**
   whether to run `investigator` (what exists today) and/or `brainstorm`
   (which behaviour to choose) on its open questions. When its report
   lists **research requests**, ask the user, then run one `investigator`
   (inside the repo) or `researcher` (outside world) subagent per request,
   in parallel. Hand all the output back to `spec-creator`, which updates
   the draft, and repeat until the user approves it.
2. **Plan phase.** Once the spec is `approved`, **ask the user** again
   whether to run `investigator` (the code the ACs touch) and/or
   `brainstorm` (how to build it). Here they may not change the ACs.
3. `implementation-planner` plans from the spec, plus any chosen option and
   brief; the caller saves the plan to `docs/plans/NNNN-<slug>.md`.
4. **Build and verify** — the user starts this with **`/run-sdd <plan>`**
   (`.claude/skills/run-sdd/`), which runs every sub-step below
   automatically from the approved spec and saved plan, fixes
   critical/warning architecture findings itself (up to 3 rounds), keeps
   its state in `docs/plans/NNNN-<slug>.state.json`, and stops only where
   the user must decide. Steps 1–3 stay manual. In order:
   1. `implementer` builds the plan.
   2. Stage the implementer's changes (`git add -- <paths>`, never `-A`:
      the index is shared), then `architecture-reviewer` reviews the
      **staged** diff only. `implementer` fixes critical and warning
      findings (suggestions are reported, not fixed), then restage and
      re-review the changed files — up to 3 rounds before asking the user.
   3. `test-writer` writes a test per AC, with the AC ID in its title.
   4. `plan-verifier` checks the code and tests against the spec and the
      plan.
   5. **Fix loop.** Re-run `implementer` / `test-writer` on the verifier's
      *Fix list* rows only, then re-run `plan-verifier`. After 2 rounds with
      rows still failing, stop and ask the user.
   6. `security-reviewer` is **required** when the spec's *Untrusted
      inputs* section has repo/PR text reaching an LLM, or LLM output
      reaching the page; otherwise ask the user.
5. After the PR merges, and on the user's word, `spec-creator` sets the
   spec to `implemented`.

`investigator` and `brainstorm` are optional in both spec and plan phases;
never run or skip them without asking.

Details: [.claude/agents/README.md](.claude/agents/README.md) · [specs/README.md](specs/README.md).

## Insights loop — mandatory

Every module (`client`, `server`, `reviewer-core`, `repo-intel`, `e2e`, `mcp`) keeps
an append-only `INSIGHTS.md`; cross-cutting lessons live in the root
[INSIGHTS.md](INSIGHTS.md). None are auto-loaded — they're read on demand,
lazily (section map first, then only what the task needs).

1. **Start of every task** — after the user's prompt and before exploring,
   editing, or answering, read the `INSIGHTS.md` of every module the prompt
   concerns (questions and reviews included, not only code changes); add the
   root one when the task spans modules or touches `scripts/`, Docker, CI, or
   `.claude/`. Say in one line which entries apply, or that none do.
   Exception: the `spec-creator` agent reads only the `INSIGHTS.md` of
   the modules the feature touches (not the root one) and never writes
   any; it uses them only to find corner cases and constraints on
   observable behaviour.
2. **End of every task** — re-read the target `INSIGHTS.md`, then append
   only substantive insights it doesn't already contain. Nothing new → write nothing.

## Before a commit or PR

Review is done by agents, not a gate: `architecture-reviewer`,
`security-reviewer` (when required) and `plan-verifier` — see *Feature
pipeline*. Their findings are advisory; only the user decides a finding is
a false positive.

A `PreToolUse` hook (`.claude/settings.json`) fetches `origin/main` and
rebases the branch before every `git commit`; on conflicts it changes
nothing and denies with the conflicting `file:line` ranges. It never
commits, and a rebase makes earlier review results stale.

## Harness scripts

Scripts under `.claude/` must locate siblings via `import.meta.url`, never
`.claude/…` from cwd.

## Docs

[docs/README.md](docs/README.md) — routing index: which content type goes
where under `docs/`. Also [TESTING.md](TESTING.md) ·
[docs/agent-prompts/](docs/agent-prompts/) — the built-in reviewer agent
system prompts.
