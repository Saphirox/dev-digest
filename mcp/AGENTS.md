# mcp — `@devdigest/mcp`

Standalone stdio MCP server: a thin HTTP client over the running DevDigest
API, exposing exactly five tools (`list_agents`, `run_agent_on_pr`,
`get_findings`, `get_conventions`, `get_blast_radius`) to an MCP client such
as Claude Code. Full picture: [../docs/plans/0010-mcp-server.md](../docs/plans/0010-mcp-server.md).

## Stack

TypeScript, `@modelcontextprotocol/server` (stdio transport), Zod. No
database, no GitHub access, no LLM call of its own — every tool call is one
or more `fetch`es to the DevDigest API and nothing else.

## Run

The DevDigest API must already be running (`./scripts/dev.sh` from the repo
root) — this package has no fallback when it isn't; tools return an
"API not reachable, start it with ./scripts/dev.sh" error instead of hanging.

```sh
cd mcp && npm install   # npm only — see "Do not touch"
```

Claude Code launches the server itself from the repo-root `.mcp.json`
(stdio, `node mcp/node_modules/tsx/dist/cli.mjs mcp/src/server.ts`); `npm run
start` runs the same entry point directly for manual poking.

## Commands

```sh
npm run typecheck   # tsc --noEmit — doubles as the "build", no dist/
npm test            # vitest — service tests use fake stores; tools.test.ts
                     # drives a real SDK Client over InMemoryTransport with a
                     # fake DevDigestApiClient injected; no network either way
```

## Map (mirrors `server/`'s module layout — onion rings, dependencies point inward)

This package follows the **same layout and import rules as `server/`**, with
MCP tools in place of Fastify routes; see
[`.claude/skills/onion-architecture/references/mcp-package.md`](../.claude/skills/onion-architecture/references/mcp-package.md)
for the authoritative folder → ring map and import matrix. Summary:

- `src/modules/<agents|reviews|conventions|repo-intel>/` — one folder per
  feature, each owning its own contracts (no central `ports.ts`/`domain/`):
  - `ports.ts` — the module's record shapes (fields this package reads from
    the API, see below) + its `<Feature>Store` interface, declared next to
    the service that uses it.
  - `repository.ts` — `<Feature>ApiRepository implements <Feature>Store`
    over the shared HTTP client; owns that module's response zod schemas +
    `safeParse` (the HTTP analogue of row → record mapping).
  - `service.ts` — a class per module (`AgentsService`, `ReviewsService`,
    `ConventionsService`); constructor takes a named deps type
    (`<Feature>ServiceDeps`, consistently across every service) holding its
    `<Feature>Store` and, where needed, the shared `Resolver`. Orchestration
    only: no `fetch`, no MCP SDK, no `process.env`. Returns bare domain
    results; a service never renders text.
  - `helpers.ts`/`constants.ts` — pure select/verdict/shape/truncate rules,
    typed by the module's own `ports.ts` records; no I/O.
  - `tools.ts` — builds this module's repository + service **from the
    container** (`register<F>Tools(server, container)`, mirrors a Fastify
    `routes.ts` building its service from `container.db`); MCP registration:
    zod I/O schemas, descriptions, annotations; validates, calls **one**
    service method, then renders.
  - `render.ts` — formats result lines: model-facing line text for that
    module's tools (one line per finding/agent/convention row).
  - `reviews/` covers both `run_agent_on_pr` and `get_findings` (one
    `tools.ts` builds one `ReviewsService` and registers both tools against
    it via `registerReviewsTools(server, container)`, like a module with two
    Fastify routes sharing a service). `repo-intel/` is a `tools.ts`-only
    stub for `get_blast_radius` — no service/repository yet, so its
    registration function takes no container.
- `src/modules/_shared/` — cross-module resolution, used directly by every
  module's `service.ts` (not gated behind the container):
  - `ports.ts` — `RepoRecord`, `PullRecord`, `AgentRef` (just enough of an
    agent to resolve a name/id), `LookupStore`.
  - `repository.ts` — `LookupApiRepository implements LookupStore`.
  - `resolver.ts` — `Resolver`: `owner/name` + PR number + agent → ids, with
    a process-lifetime PR cache (`resolvePr`/`invalidatePr`).
  - `schemas.ts` — shared zod input fields (`repo`, `pr`, `agent`).
  - `messages.ts` — the only catalogue for error and ok/stub texts
    (domain error → forward-leading text, plus the non-error "ok"/stub
    prose); a module's `render.ts` is the separate catalogue for result
    lines.
- `src/adapters/devdigest-api/client.ts` — `DevDigestApiClient`, the only
  file that calls `fetch`; maps network/timeout/429/error-envelope failures
  to `platform/errors`. Knows no module or schema — response validation is
  each module's `repository.ts`'s job.
- `src/platform/` — `config.ts` (the only `process.env` read), `log.ts`
  (stderr-only logger), `errors.ts` (`McpError` base class + 11 typed domain
  errors, no user-facing prose), `container.ts` (composition root, but for
  **cross-cutting infra only**: the HTTP client, the shared `Resolver` [+ its
  `_shared` repository], config values — it does not construct a feature
  module's repository or service; each module's `tools.ts` does that from
  `container.client`/`container.resolver`).
- `src/modules/index.ts` — `registerModules(server, container)`: imports
  every module's `tools.ts` and registers it against `container`. The one
  sanctioned place that crosses module boundaries at the registration level
  (mirrors `server/src/modules/index.ts` importing every module's `routes.ts`).
- `src/app.ts` — `createApp(container)`: builds the `McpServer` and calls
  `registerModules(server, container)`. Constructs nothing itself — not the
  container, not a repository, not a service.
- `src/server.ts` — entry point: `loadConfig()` → `new Container(config)` →
  `createApp(container)` → `StdioServerTransport` → `connect()`. Nothing
  above `connect()` performs network I/O.

## Non-default conventions

- **stdout carries JSON-RPC only.** MCP framing is line-delimited JSON on
  stdout; a stray `console.log` anywhere in `src/` corrupts every message
  after it. All logging goes through `log.ts` to stderr.
- **No `@devdigest/shared` import, anywhere.** `server/src/vendor/shared` is
  authored against zod 3, this package pins zod ^4 for the SDK's peer
  requirement, and aliasing `@devdigest/shared` under zod 4 fails `tsc`
  inside `vendor/shared/contracts/platform.ts:95` — zod 4 infers an
  exhaustive `Record` for `z.record(FeatureModelId, …).default({})`, which
  zod 3's inference accepted. `vendor/shared` is do-not-touch, so `mcp/`
  instead hand-types the handful of response fields it reads in each
  module's own `ports.ts` (and `_shared/ports.ts` for resolver-only fields),
  validated at the HTTP boundary in that module's `repository.ts`.
- **SDK pinned to exactly `2.0.0`**, dependency and devDependency alike
  (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`) — not
  `^2.0.0`. A caret resolves to `2.1.0` and pulls a second, mismatched copy
  of `@modelcontextprotocol/core` alongside the one `2.0.0` pins exactly,
  which breaks module identity between the server and its own test client.
- **Tool names, argument shapes and descriptions are fixed by the course
  rubric** (`list_agents`, `run_agent_on_pr`, `get_findings`,
  `get_conventions`, `get_blast_radius`; flat `repo`/`pr`/`agent` args) — do
  not rename or restructure them to "improve" the API.
- **`run_agent_on_pr` never reads `GET /pulls/:id/runs/:runId/trace`.**
  `run-executor` calls `completeAgentRun` (the `done` status this tool polls
  for) before `saveRunTrace` runs, so a trace read right after `done` can 404
  or return a stale/partial trace — a real, previously-hit race
  (`server/INSIGHTS.md` 2026-09-19 "Flaky `/runs/:id/trace` read"). Instead,
  once polling sees `done`, it fetches `GET /pulls/:id/reviews` and matches
  the run by `run_id` — `insertReview`/`insertFindings` are written before
  `completeAgentRun`, so that read is race-free by construction.
- **Domain errors are the only error type services throw**, and every one
  extends `McpError` (`platform/errors.ts`, a `code` discriminant + `Error`,
  mirrors `server/`'s `AppError`); the forward-leading, user-facing text
  lives in exactly one place, `src/modules/_shared/messages.ts` — a service
  or repository never composes prose itself. `messages.ts`'s `toToolResult`
  switches on `.code` and is exhaustive: TypeScript rejects the build if a
  new `McpError` subclass has no matching `case`. This keeps every error
  message auditable against the plan's message catalogue in one file instead
  of scattered `throw new Error(...)` call sites. Repositories also never
  know tool names (`MalformedResponse`'s `endpoint` is an HTTP path
  template, not a tool name). The same rule covers the handful of
  non-error, non-exception prose strings a tool needs (`list_agents`' "No
  agents configured.", `get_blast_radius`'s stub text) — they live in
  `messages.ts` too (`noAgentsMessage()`, `blastRadiusStubMessage()`), never
  inlined in a `tools.ts`.
- **Tool descriptions and the whole `tools/list` payload are size-budgeted**
  (`instructions` ≤ 160 chars, serialized `tools/list` ≤ ~6,000 chars) and
  the budget is enforced by `test/tools.test.ts`, not by convention — a new
  field or a longer description that trips the assertion is a real
  regression, not a flaky test.
- **`get_findings`'s `running_run_ids` field holds run ids, not agent
  names.** `GET /pulls/:id/runs/active` returns only
  `{run_id,status,error}`, so there is no agent name to report while a run
  is still in flight.
- **`get_findings`'s `detail:"full"` limit is capped below the plan's raw
  50-item ceiling** so an all-maximum-length result (every item at the
  800/600-char rationale/suggestion truncation cap) still fits the
  ≤40,000-char budget in `test/reviews-helpers.test.ts` — a longer worst-case
  fixture than a mixed-length one, computed from an all-maximum-length
  fixture rather than guessed; `FULL_LIMIT_MAX` in
  `modules/reviews/constants.ts` is the exact resulting boundary.
- **Enforcement is three-layered, not just the local test run**: the import
  rules in *Map* above are checked by the kind-resolved allowlist scan (plus
  `no-cross-module-internals` and a "no concrete repository/service/client/
  resolver construction outside `platform/container.ts` or a module's
  `tools.ts`" check) in `test/architecture.test.ts`; both that and
  `npm run typecheck`/`npm test` run in CI on every push/PR touching `mcp/**` or
  `server/src/vendor/shared/**` (`.github/workflows/mcp.yml`); and the
  `pr-self-review` gate (`.claude/skills/pr-self-review/scripts/checks.mjs`)
  runs the same typecheck + test pair whenever a diff touches
  `mcp/src/**`/`mcp/test/**`, so a push cannot bypass either.

## Do not touch

- `../server/src/vendor/shared/**`, `../client/src/vendor/shared/**` — see
  above; this package deliberately does not import them.
- `mcp/package-lock.json` — npm-managed; never run `pnpm install` here (see
  root [AGENTS.md](../AGENTS.md) "Do not touch" — a stray `pnpm-lock.yaml`
  or `pnpm-workspace.yaml` is the tell).

## Docs

[../docs/plans/0010-mcp-server.md](../docs/plans/0010-mcp-server.md) ·
[INSIGHTS.md](INSIGHTS.md)

## Insights

Lessons from past sessions: [INSIGHTS.md](INSIGHTS.md). If you haven't read
it in this task yet, read it now — before changing or explaining anything
here (see *Insights loop* in the root [AGENTS.md](../AGENTS.md)).
