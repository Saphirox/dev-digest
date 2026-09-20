# Agents

Map of the subagents in `.claude/agents/`. Each agent's file is the source of
truth for its rules; this page only says what exists, who does what, and where
the rules come from. Skills live in [../skills/README.md](../skills/README.md).

## At a glance

| Agent | Job | Model | Tools | Writes files |
|---|---|---|---|---|
| [`researcher`](researcher.md) | Answers repo and external-research questions with cited evidence | `sonnet` | `Read, Glob, Grep, Bash, WebFetch, WebSearch, AskUserQuestion` | no |
| [`planner`](planner.md) | Turns a task into a structured Development Plan | `opus` | `Read, Glob, Grep, Bash` | no |
| [`implementer`](implementer.md) | Executes a plan in `client/`, `server/`, `reviewer-core/` and verifies its own changes | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash, Skill` | yes (code, tests, INSIGHTS) |

None of them has `Agent`, so none can spawn subagents. None commits or pushes.
Architecture and security review are not agents yet: the user runs
`/pr-self-review` before a PR.

## Flow

```
question ──► researcher ──► report (evidence, sources, gaps)
task ──► planner ──► Development Plan ──► implementer ──► change report
                                                  └─► user runs /pr-self-review
```

`researcher` is independent of the other two. `planner` and `implementer` are a
pair: the plan is the contract between them.

## researcher

- **Responsibility:** read-only investigation, either of this repo (how
  something works, where it lives, why it was decided, git history) or of the
  outside world (docs, specs, changelogs, library behaviour). Never edits and
  never decides for the caller.
- **Permissions:** read-only by prompt (`Bash` for reading only). Has web tools
  and `AskUserQuestion` for the clarification step. No `Write`/`Edit`/`Agent`.
- **Input:** a concrete question. A bare topic gets a clarifying question first.
- **Output:** *Format A* (repo) or *Format B* (external), each with a Bottom
  line, cited findings, and a mandatory *Could not establish* section.
- **Not for:** planning a change (that is `planner`).

## planner

- **Responsibility:** produce a plan an implementer can execute without
  guessing, consistent with the modules, the project skills, the local
  `INSIGHTS.md` files and the architecture constraints. It also decides which
  skills the implementer will apply, so the plan cannot contradict them.
- **Permissions:** read-only by prompt (`Bash` for reading only; a banned list
  covers `git fetch/stash/checkout`, `curl`, `env`, secrets). No `Write`,
  `Edit`, `Agent` or `Skill`: it reads `SKILL.md` files with `Read`. Because no
  hook scopes `Bash` per agent, the caller should check `git status` after a run.
- **Input:** a concrete task with a module boundary. Otherwise it returns only
  a `## Clarification needed` block.
- **Output:** a plan with `Status`, citation sha, Goal, Out of scope, Context
  (INSIGHTS applied, history, assumptions), Modules & files, a required
  **Component map**, optional Mermaid **Diagrams**, Steps (each with Files,
  Skills, Verify), Skills for implementer, Architecture constraints,
  Do-not-touch, Verification, Risks, Open questions, Could not establish,
  Insight candidates. It owns the single skill-mapping table ("Lazy skill
  reading").
- **Not for:** one-line fixes, review, research questions.

## implementer

- **Responsibility:** carry out the plan, load the skills it names, run the
  existing tests, and check only its own diff. Does not review architecture or
  security.
- **Permissions:** can edit and run commands. Bans destructive git and docker
  commands, `curl`/`wget`, reading secrets, and `git commit/push`, `gh pr *`;
  never runs `/pr-self-review`. Respects the root `AGENTS.md` "Do not touch"
  list. Skills load lazily through the `Skill` tool; nothing is preloaded.
- **Input:** a plan from `planner` (or a small, well-specified change). It stops
  on `Status: blocked`, a clarification block, or a blocking open question.
- **Output:** Done, Verification (command, result), Not verified, Deviations,
  Follow-ups, INSIGHTS, Working tree. Leaves the work uncommitted.
- **Not for:** planning, review, committing, pushing.

## Sources behind the rules

Retrieved 2026-09-20. The Claude Code pages were read through a summarising
model, so quote wording should be re-checked against the live page before it is
cited elsewhere.

| # | Source | Type |
|---|---|---|
| A | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) | Anthropic docs |
| B | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | Anthropic docs |
| C | [Extend Claude with skills](https://code.claude.com/docs/en/skills) | Anthropic docs |
| D | [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Anthropic docs |
| E | [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Anthropic engineering |
| F | [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Anthropic engineering |
| G | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Anthropic engineering |

### planner and implementer

| Rule in the agents | Based on |
|---|---|
| Explicit `tools` allowlist, no `Agent`; frontmatter fields (`name`, `description`, `tools`, `model`) | A |
| Description says when to use it and when not to, with "use proactively" style triggers | A, D |
| Read-only planner, writing implementer; Explore, Plan, Implement, verify as separate phases | B, G |
| Plan names files and interfaces, states what is out of scope, ends with a verification step | B |
| Implementer shows evidence (commands and results), never asserts success | B |
| Each delegated task states objective, output format, tools and boundaries | E |
| Handoffs are short, structured, and use `path:line` identifiers instead of pasted code | F |
| Ground truth from the environment (tests, typecheck, `arch:check`) at each step | G |
| Skills are loaded lazily by area, not preloaded; skills are not inherited by subagents | A, C, D |
| Skill mapping is a summary; `routing.json` wins | this repo ([../skills/README.md](../skills/README.md)) |
| Review stays with a fresh, separate reviewer; the implementer does not review itself | B |
| Written in English, whatever language the task uses | project decision |

### Repo rules the agents encode

These come from the repo, not from the sources above: the "Do not touch" list,
the no-commit-until-asked rule, the INSIGHTS start/end loop and the
one-package-manager-per-package rule (root [AGENTS.md](../../AGENTS.md)); the
shared-worktree and stash hazards, and the `db:migrate` shared-volume trap
(root [INSIGHTS.md](../../INSIGHTS.md)).

## Known limits

- Read-only is enforced by the tool list plus prompt, not by a hook: no hook
  scopes `Bash` per agent.
- Not verified: whether an allowlist with `Skill` lets the implementer load
  skills at runtime; whether `skills:` honours `disable-model-invocation`.
- Not built yet: architecture-review and security-review agents.

## Changing an agent

- Edit the agent's own file; keep this page a map, not a copy.
- Adding or renaming a skill: update `pr-self-review/references/routing.json`
  and the planner's "Lazy skill reading" table.
- Changing what `planner` produces means checking `implementer` still consumes
  it, and the reverse.
- Adding an agent: add it to the table above.
