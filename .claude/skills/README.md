# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion rings for `server/` + `reviewer-core`: where code lives, inward-only imports, ports/adapters, repositories, transactions; enforced by `arch:check` (dependency-cruiser) |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [frontend-ui-architecture](frontend-ui-architecture/SKILL.md) | Frontend | Code organization: folder structure, where components/constants/helpers/business logic live, boundaries, Next.js placement |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [pr-self-review](pr-self-review/SKILL.md) | Workflow | **Manual only** (`/pr-self-review`; `disable-model-invocation`). Pre-PR review of all local changes: routes changed files to the skills above, runs repo-rule checks + `arch:check`, blocks `gh pr create`/`git push` on any critical. Add every new skill to its `references/routing.json` |
| [git-rebase-sync](git-rebase-sync/SKILL.md) | Workflow | Rebase onto fresh `origin/main` before commits (hook `.claude/hooks/rebase-before-commit.mjs`), conflict summaries, repo-specific resolution rules, recovery |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |

All ten agents in `.claude/agents/` (`brainstorm`, `investigator`,
`researcher`, `planner`, `implementer`, `test-writer`,
`architecture-reviewer`, `plan-verifier`, `doc-writer`, `insight-curator`)
load skills lazily by area, never by preload, and the mechanism splits by
what the agent does: agents that write code — `implementer` and
`test-writer` — have the `Skill` tool and load skills through it; agents
that only read for rules — `planner`, `architecture-reviewer`,
`plan-verifier` (which loads none), `doc-writer`, `brainstorm`,
`investigator` (`mermaid-diagram`, for Mode B's optional diagram) and
`insight-curator` (`engineering-insights`) — have no `Skill` tool and read a
skill's `SKILL.md` (and, for `doc-writer`, `mermaid-diagram`'s
`examples.md`) directly with `Read`. Since
`tools:` is an allowlist, omitting `Skill` is what enforces the read-only
mechanism. The single skill-mapping table lives in `.claude/agents/planner.md`
("Lazy skill reading"), covering `planner`, `implementer` and `test-writer`;
each agent follows its own plan/report input's named skills first and falls
back to that table. When you add or rename a skill, update
`pr-self-review/references/routing.json` **and** that table — adding an agent
does **not** require a `routing.json` change, since that file routes files to
skills for `pr-self-review`, not agents to skills.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
