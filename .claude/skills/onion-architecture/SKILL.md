---
name: onion-architecture
description: "Onion Architecture for the DevDigest backend (server/ Fastify + Drizzle API and the reviewer-core engine): which ring a piece of code belongs to, which way imports may point, and how Fastify routes, services, Drizzle repositories, ports/adapters, the DI container and tests fit the rings. Use whenever you add or change backend code: a new module, route, service, repository, query, adapter, port, job handler, SSE stream or reviewer-core feature; when you decide where a backend function or file belongs; move logic out of a route; add a transaction; wire something into platform/container.ts; review a server PR for layering; or answer 'where should this go' on the backend. Trigger on routes.ts, service.ts, repository.ts, ports.ts, helpers.ts, container.db, container.ts, adapters/, drizzle in a route, port, adapter, dependency injection, layering, clean/hexagonal/onion architecture, dependency-cruiser, arch:check, even when the user doesn't say 'architecture'. Not for Fastify API mechanics, Drizzle query syntax or Postgres schema design: those live in fastify-best-practices, drizzle-orm-patterns and postgresql-table-design."
metadata:
  version: "1.0.0"
  updated: "2026-09-19"
---

# Onion Architecture (backend)

Where backend code lives and which way it may depend. Scope: `server/`
(`@devdigest/api`) and `reviewer-core/` (`@devdigest/reviewer-core`). This
skill covers placement and dependency direction. It doesn't cover how to use
Fastify or Drizzle.

**Sibling skills. Link to them, don't restate them:**
- `fastify-best-practices`: plugins, hooks, schemas, error handling mechanics.
- `drizzle-orm-patterns`: query syntax, relations, transactions API, migrations.
- `postgresql-table-design`: columns, indexes, constraints.
- `zod`: schema authoring, `safeParse`, inference.

**Reference files. Read only the one the task needs:**

| File | Read it when |
|---|---|
| [references/layers-and-dependency-rule.md](references/layers-and-dependency-rule.md) | You need the full ring → folder map, the import matrix, or the list of known debt |
| [references/fastify-presentation.md](references/fastify-presentation.md) | Writing or reviewing a `routes.ts`, error mapping, SSE, job-handler registration |
| [references/application-services.md](references/application-services.md) | Writing a service, executor or pipeline; service dependencies; transactions across repositories |
| [references/drizzle-infrastructure.md](references/drizzle-infrastructure.md) | Writing a repository, mapping rows to contracts, `tx`, translating Postgres errors |
| [references/ports-and-adapters.md](references/ports-and-adapters.md) | Adding an external system (LLM, GitHub, git, a parser), a new port, or wiring the DI container; anything in `reviewer-core` |
| [references/testing-and-enforcement.md](references/testing-and-enforcement.md) | Choosing the test type per ring; running or changing `arch:check` (dependency-cruiser) |

Sources for every rule: [references.md](references.md).

---

## Step 0: The project's conventions win

1. Read `server/AGENTS.md` (and `reviewer-core/AGENTS.md` if you touch it).
2. Copy the shape of a **clean** module: `repos`, `agents` or `reviews`
   (`routes.ts` → `service.ts` → `repository.ts`, plus `helpers.ts` and `constants.ts`).
3. **Don't** copy `pulls`, `polling`, `workspace` or `settings`. Their routes
   query Drizzle directly through `container.db`. That is known debt, not a
   pattern (see the debt list in `references/layers-and-dependency-rule.md`).

Why: in Onion Architecture a rule that holds almost everywhere is worth
little. One route that "just queries the table" makes the next one look
normal. Match the clean modules, and name any debt you have to touch.

---

## The rings

```
            ┌───────────────────────────────────────────────────────────┐
            │ OUTER: presentation · infrastructure · composition · tests │
            │  routes.ts, app.ts error handler, SSE                      │
            │  repository.ts, src/db/*, src/adapters/*, platform/jobs…   │
            │  platform/container.ts, app.ts, server.ts   test/*         │
            │   ┌───────────────────────────────────────────────────┐    │
            │   │ APPLICATION: use cases                             │    │
            │   │  service.ts, run-executor.ts, pipeline/*, job fns  │    │
            │   │   ┌───────────────────────────────────────────┐    │    │
            │   │   │ DOMAIN SERVICES / PORTS                    │    │    │
            │   │   │  vendor/shared/adapters.ts (LLMProvider,…) │    │    │
            │   │   │  modules/<f>/ports.ts, repo-intel/types.ts │    │    │
            │   │   │   ┌───────────────────────────────────┐    │    │    │
            │   │   │   │ DOMAIN MODEL                       │    │    │    │
            │   │   │   │  vendor/shared/contracts (zod)     │    │    │    │
            │   │   │   │  helpers.ts, constants.ts (pure)   │    │    │    │
            │   │   │   │  platform/errors.ts                │    │    │    │
            │   │   │   │  reviewer-core engine              │    │    │    │
            │   │   │   └───────────────────────────────────┘    │    │    │
            │   │   └───────────────────────────────────────────┘    │    │
            │   └───────────────────────────────────────────────────┘    │
            └───────────────────────────────────────────────────────────┘
                         every import points INWARD
```

## Core principles

1. **Dependencies point inward, only.** Code may import from its own ring or
   any ring closer to the centre, never outward. A service never imports a
   route, a Drizzle table or `src/adapters/*`. A helper never imports anything
   with I/O. *(Palermo part 3: "Direction of coupling is toward the center.")*
2. **The database and every SDK are outside.** Postgres, Drizzle, Octokit,
   simple-git, the OpenAI/Anthropic SDKs, ast-grep and ripgrep are
   infrastructure. The core names what it needs as an **interface (port)**, and
   an adapter in the outer ring implements it. *(Palermo: "the database is not
   the center"; Cockburn, Ports & Adapters)*
3. **Interfaces belong to the ring that uses them.** A repository interface
   is declared next to the service that needs it (`modules/<f>/ports.ts`),
   not next to the Drizzle class. That is what lets the dependency point
   inward (dependency inversion). *(Palermo part 3: "Inner layers define
   interfaces. Outer layers implement interfaces.")*
4. **One composition root.** Only `platform/container.ts`, `app.ts` and each
   module's route plugin (the module's own wiring point) create concrete
   classes. Everything else receives dependencies.
5. **The core is testable without infrastructure.** If a unit test of a
   service or helper needs Docker, a network or a key, the layering is broken.
   The ring determines the test type (see `references/testing-and-enforcement.md`).
   *(Palermo part 3: "All application core code can be compiled and run
   separate from infrastructure.")*

## "Where does this go?"

```
Is it HTTP-specific (params, status codes, reply, SSE framing)?
  └─ yes → modules/<f>/routes.ts                      (presentation)
Does it talk to Postgres / Drizzle?
  └─ yes → modules/<f>/repository.ts or repository/*.repo.ts   (infrastructure)
Does it call an external system or native lib (GitHub, git, LLM, fs, ast-grep)?
  └─ yes → src/adapters/<port>/<impl>.ts behind an interface   (infrastructure)
Is it an interface the application needs from the outside world?
  └─ cross-module or shared with client → vendor/shared/adapters.ts (edit both copies)
     module-local (e.g. a repository contract) → modules/<f>/ports.ts
Does it orchestrate a use case (load → decide → persist → enqueue/publish)?
  └─ yes → modules/<f>/service.ts (or run-executor.ts / pipeline/*)   (application)
Is it a pure transform, rule or calculation with no I/O?
  └─ module-local → modules/<f>/helpers.ts; a literal → constants.ts   (domain)
     part of the review engine → reviewer-core/src/*                  (domain)
Is it a request/response/entity shape?
  └─ vendor/shared/contracts/* (zod + inferred type, same name)       (domain)
Does it construct concrete classes or pick an implementation?
  └─ platform/container.ts (shared) or the module's routes.ts plugin (module-local)
```

## Hard rules

Each rule is backed by `pnpm arch:check` (dependency-cruiser,
`server/.dependency-cruiser.cjs`). **error** rules fail the check. **warn**
rules are known debt that new code must not add to.

| Rule | Severity | What it forbids |
|---|---|---|
| `shared-contracts-pure` | error | `vendor/shared` importing anything but itself and `zod` |
| `reviewer-core-pure` | error | `reviewer-core` importing Fastify, Drizzle, Postgres, Octokit, simple-git or `server/src/*` |
| `reviewer-core-engine-no-sdk` | error | engine code outside `reviewer-core/src/llm/` importing the `openai` SDK or `OpenRouterProvider` |
| `no-cross-module-internals` | error | module A importing module B's `routes`/`service`/`repository`/`run-executor` |
| `platform-not-outward` | error | `platform/*` (except `container.ts`) importing `modules/*` |
| `not-to-unresolvable` | error | imports that don't resolve (typos, or a package the ring doesn't install) |
| `routes-no-persistence` | warn | `routes.ts` importing `drizzle-orm` or `src/db/*` |
| `application-no-drizzle` | warn | non-repository module files importing `drizzle-orm` or `src/db/schema` |
| `modules-no-concrete-adapters` | warn | `modules/*` importing `src/adapters/*` |
| `adapters-not-inward-to-app` | warn | `adapters/*` importing `modules/*` or the composition root |
| `pure-module-files-no-io` | warn | `helpers.ts`/`constants.ts` importing Fastify, Drizzle, `src/db`, adapters or the container |
| `no-circular` | warn | import cycles |

Run it: `cd server && ./node_modules/.bin/depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --output-type err`
(or `pnpm arch:check`, where the pnpm wrapper works; see the `ERR_PNPM_IGNORED_BUILDS`
entry in the root `INSIGHTS.md`). Baseline on 2026-09-19: **0 errors, 29 warnings**.
A change that raises the warning count adds debt, so fix it or justify it in the PR.

## Anti-patterns → fix

| You see | Why it hurts | Do instead |
|---|---|---|
| `container.db.select()` / `import { eq } from 'drizzle-orm'` in `routes.ts` | Presentation depends on the DB. Can't test the route's logic without Postgres. Tenancy scoping gets re-implemented per route | Move the query to `repository.ts`, call it from a service, and keep the route at "validate → call → return" |
| Service does `new FooRepository(container.db)` and types the field as the class | Application depends on the concrete Drizzle class, so tests need a DB | Declare `FooStore` in `ports.ts`, type the dependency as `FooStore`, construct `FooRepository` in the module plugin or container |
| `import { parseSymbols } from '../../adapters/astgrep/index.js'` in a module | Application is welded to a native lib | Call it through a port on the container (`container.repoIntel`, a new port), or move a truly pure parser inward |
| `helpers.ts` imports `db/schema` to type a row | The "pure" file now drags in infrastructure types | The repository maps row → contract type, and helpers work on contract types only |
| Two repository writes that must succeed together, with no transaction | Partial writes on failure | A unit-of-work port in the service that runs both writes in one `db.transaction` (see `references/application-services.md`) |
| `throw reply.code(404)` / `reply` passed into a service | Application knows HTTP | Throw `NotFoundError` (and other `AppError`s). The shared error handler in `app.ts` maps it to a status |
| `process.env.X` read inside a service or `reviewer-core` | Hidden config and untestable branching | Use `AppConfig` from the container. `reviewer-core` receives values as parameters |
| New SDK client created inline in a service | No seam to mock, and credentials handling spreads | A port + an adapter + a container getter + a mock in `adapters/mocks.ts` |

## PR checklist (backend)

- [ ] Every new file sits in the ring the decision tree gives. Its imports point only inward.
- [ ] `routes.ts` has no `drizzle-orm`, `src/db/*` or `src/adapters/*` import. It validates with zod schemas, resolves the workspace with `getContext`, calls one service method and returns a contract type.
- [ ] Services depend on interfaces (`@devdigest/shared` ports, `ports.ts`), never on `src/adapters/*` or Drizzle.
- [ ] Every query lives in a repository and is scoped by `workspaceId`.
- [ ] Multi-write use cases run inside one transaction owned by the service.
- [ ] A new external dependency has a port, an adapter, a container getter, a `ContainerOverrides` field and a mock.
- [ ] `reviewer-core` stays pure: no DB, fs, GitHub, `process.env`. Only `src/llm/` touches an SDK.
- [ ] Tests match the ring: pure unit tests for domain and services (with fakes), `*.it.test.ts` for repositories.
- [ ] `arch:check`: 0 errors, and the warning count is not above the baseline.
