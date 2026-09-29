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
| [git-rebase-sync](git-rebase-sync/SKILL.md) | Workflow | Rebase onto fresh `origin/main` before commits (hook `.claude/hooks/rebase-before-commit.mjs`), conflict summaries, repo-specific resolution rules, recovery |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [spec-writing](spec-writing/SKILL.md) | Shared | Feature specs in `specs/`: EARS with good/bad examples, design-gap checklists, NFR categories, priorities, examples, traceability; `scripts/lint.mjs` (also `spec-creator`'s PostToolUse hook). Preloaded by `spec-creator` (with `security`, `engineering-insights`, `onion-architecture`, `zod`); read by `implementation-planner`/`plan-verifier` when interpreting a spec |
| [run-sdd](run-sdd/SKILL.md) | Workflow | **Manual only** (`/run-sdd <plan or spec>`; `disable-model-invocation`). Runs the build half of Spec-Driven Development from an approved spec + saved plan: implementer (waves), architecture review with automatic critical/warning fix rounds (≤3), test-writer, plan-verifier fix loop (≤2), security review when required; state in `docs/plans/NNNN-<slug>.state.json` (`--resume`); stops only where the user must decide |

All twelve agents in `.claude/agents/` (`spec-creator`, `brainstorm`, `investigator`,
`researcher`, `implementation-planner`, `implementer`, `test-writer`,
`architecture-reviewer`, `security-reviewer`, `plan-verifier`, `doc-writer`,
`insight-curator`)
load skills lazily by area — except `implementation-planner`, which preloads every
frontend and backend skill (all but `mermaid-diagram`, `engineering-insights`
and the workflow skills) through its `skills:` frontmatter so it can plan
across `client/` and `server/` in one pass, and `spec-creator`, which
preloads `spec-writing`, `security`, `engineering-insights` (read side) and
`onion-architecture` (boundaries) and `zod` (contract semantics) — and the mechanism splits by
what the agent does: agents that write code — `implementer` and
`test-writer` — have the `Skill` tool and load skills through it; agents
that only read for rules — `implementation-planner` (for `mermaid-diagram` only), `architecture-reviewer`,
`security-reviewer` (`security/SKILL.md` + `checklists.md`),
`plan-verifier` (which loads none), `doc-writer`, `brainstorm`,
`investigator` (`mermaid-diagram`, for Mode B's optional diagram) and
`insight-curator` (`engineering-insights`) — have no `Skill` tool and read a
skill's `SKILL.md` (and, for `doc-writer`, `mermaid-diagram`'s
`examples.md`) directly with `Read`. Since
`tools:` is an allowlist, omitting `Skill` is what enforces the read-only
mechanism. The single skill-mapping table lives in `.claude/agents/implementation-planner.md`
("Skill mapping"), covering `implementation-planner`, `implementer` and `test-writer`;
each agent follows its own plan/report input's named skills first and falls
back to that table. When you add or rename a skill, update that table (and,
for a frontend/backend skill, the implementation-planner's `skills:` preload
list).

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
