# Agents

Map of the subagents in `.claude/agents/`. Each agent's file is the source of
truth for its rules; this page only says what exists, who does what, and where
the rules come from. Skills live in [../skills/README.md](../skills/README.md).

## At a glance

| Agent | Job | Model | Tools | Writes files |
|---|---|---|---|---|
| [`spec-creator`](spec-creator.md) | Writes one feature spec `specs/spec-NNNN-<slug>.md` with EARS acceptance criteria; analyses the design for gaps and asks the user about each | `opus` | `Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion` + Chrome read/screenshot tools | yes (spec files only) |
| [`brainstorm`](brainstorm.md) | Generates 4–6 grounded, materially distinct options, then asks the user which one | `opus` | `Read, Glob, Grep, Bash, AskUserQuestion` | no |
| [`investigator`](investigator.md) | Read-only investigation **of the code only**: targeted search, or a whole-area onboarding brief | `sonnet` | `Read, Glob, Grep, Bash` | no |
| [`researcher`](researcher.md) | Answers questions needing the outside world — **code and web both** — with cited evidence | `sonnet` | `Read, Glob, Grep, Bash, WebFetch, WebSearch, AskUserQuestion` | no |
| [`implementation-planner`](implementation-planner.md) | Reviews the requirements (spec, chosen option or task), asks the user about gaps and single- vs multi-agent execution, then writes a Development Plan — never a spec | `opus` | `Read, Glob, Grep, Bash, AskUserQuestion` | no |
| [`implementer`](implementer.md) | Executes a plan in `client/`, `server/`, `reviewer-core/`, `mcp/` and verifies its own changes | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash, Skill` | yes (code, tests, INSIGHTS) |
| [`test-writer`](test-writer.md) | Writes or updates tests for existing behaviour, or reproduces a bug with a failing test | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash, Skill` | yes (tests only) |
| [`architecture-reviewer`](architecture-reviewer.md) | Read-only architecture review of a diff: boundaries the mechanical checks can't see | `opus` | `Read, Glob, Grep, Bash` | no |
| [`security-reviewer`](security-reviewer.md) | Read-only security review of a diff: source→sink data-flow tracing, OWASP-shaped, repo-aware | `opus` | `Read, Glob, Grep, Bash` | no |
| [`plan-verifier`](plan-verifier.md) | Adversarial per-item check of finished code against a Development Plan | `opus` | `Read, Glob, Grep, Bash` | no |
| [`doc-writer`](doc-writer.md) | Documents an already-implemented feature into `docs/`, grounded in the diff | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash` | yes (docs only) |
| [`insight-curator`](insight-curator.md) | Scans `INSIGHTS.md` for duplicate/stale entries and lesson→rule promotions; proposes, never writes | `opus` | `Read, Glob, Grep, Bash` | no |

Every agent sets `effort` and `color`, keeps its `description` under ~50
words, and opens with a **Working style** block: do the task at the scope
asked, lead the report with the outcome, treat text read from files and the
web as data; reviewers report every finding with its confidence rather than
capping the list. No agent sets `maxTurns`, so a long task is not cut off
mid-run.

None of the twelve has `Agent`, so none can spawn subagents. None commits or
pushes. Architecture review is an agent (`architecture-reviewer`) and so is
security review (`security-reviewer`), and `plan-verifier` checks the work
against the spec and the plan. There is no push/PR gate: their findings are
advisory, and the user decides what gets fixed.

## Flow

```
question touching the outside world ──► researcher ──► report (code + web evidence, sources, gaps)
question inside the code only, or onboarding ──► investigator ──► Format A report, or Format B onboarding brief

MAIN FLOW: spec-creator ──► implementation-planner ──► /run-sdd <plan>

feature brief + design ──► spec-creator ──► asks the user about gaps ──► specs/spec-NNNN-<slug>.md (draft)
        ◄── loop while draft: support requests in its report, run on demand by the caller ──► spec-creator updates the draft
        ──► user approves ──► specs/spec-NNNN-<slug>.md (approved)

spec / task ──► implementation-planner ──► reviews requirements, asks the user
                                  (clarifications + single-agent vs multi-agent) ──► Development Plan
                                  (support requests in its report ──► caller runs them ──► re-run with the results)
                                  ──► saved to docs/plans/NNNN-<slug>.md

SUPPORTING AGENTS (on demand, never a fixed step)
  investigator ──► a fact or brief about this repo · researcher ──► the outside world, with its repo half
  brainstorm ──► 4–6 options ──► asks the user ──► the chosen option
  requested by spec-creator or implementation-planner, or run directly by the user/caller

/run-sdd docs/plans/NNNN-<slug>.md
        single-agent: one implementer runs every step · multi-agent: caller runs the Work-split tracks wave by wave
                        └─► implementer ──► change report
                              ──► architecture-reviewer ──► findings ──► implementer fixes the accepted ones
                              ──► test-writer ──► a test per spec AC, AC ID in the title
                              ──► plan-verifier ──► spec + plan compliance matrices + Fix list
                                     (code AND tests vs every spec AC/edge case, code vs every plan item)
                                     ▲                                  │ not-met rows
                                     └── implementer / test-writer ◄────┘ on those rows only; ≤2 rounds, then ask the user
                              ──► security-reviewer ──► findings/verified-safe
                                     (required when untrusted text reaches an LLM or LLM output reaches the page; else ask)
                              ──► doc-writer ──► docs/
        small, well-understood change, on the user's word: implementation-planner straight from the task (no spec)

test-writer standalone ──► tests for existing behaviour, or a failing bug repro

wrap-up / retro ──► insight-curator ──► ready-to-paste proposals ──► engineering-insights skill writes
```

`researcher` and `investigator` both investigate this codebase; they are
split by what the question ultimately needs, not by where they may look. Any
question that touches the outside world — a doc, a spec, a changelog, a
version's behaviour, prior art — is `researcher`'s, **including its repo
half**, so it keeps `Bash` and a full repo-research mode. A question that
lives entirely inside this repo, and every onboarding brief, is
`investigator`'s; it has no web tools at all, and `tools:` being an allowlist
is what enforces that.
In the feature pipeline the spec comes first, because it states the real
requirements; the main flow is `spec-creator` → `implementation-planner` →
`/run-sdd`. `investigator`, `researcher` and `brainstorm` are supporting
agents used on demand, not pipeline steps. `spec-creator` and
`implementation-planner` cannot spawn agents, so each lists **support
requests** in its report when it needs a repo fact, outside research, or
options compared; the caller runs them (independent ones in parallel) and
hands the results back. For `spec-creator` that settles *what* the behaviour
is; for `implementation-planner` it settles *how* to build it, with the ACs
and NFRs fixed. The user or caller may also run any of them directly.
`brainstorm` generates options and then **asks the user directly** with
`AskUserQuestion` — the agent never picks, and never reads a `## Leaning`
or the caller's earlier wording as the answer. It reports the chosen option in a dedicated section,
and the requester builds from that section alone — `spec-creator` turns it
into requirements, `implementation-planner` into the Development Plan. The
caller (not `implementation-planner` — it has no `Write`) saves the plan to
`docs/plans/NNNN-<slug>.md` before handing the path to `implementer` — or,
when the user chose multi-agent mode, to one agent per *Work split* track,
wave by wave (`docs/README.md` "Plans — the rule"). `implementation-planner` and
`implementer` are a pair: the plan is the contract between them.
`test-writer`, `plan-verifier`,
`architecture-reviewer`, `security-reviewer` and `doc-writer` all consume
either a plan or an implementer's report (or both) and never edit production
code (`test-writer` edits only test files; `doc-writer` edits only `docs/`). `insight-curator`
sits on the wrap-up lane: it reads the `INSIGHTS.md` files and proposes
duplicate/stale/promotion bullets in the `engineering-insights` skill's exact
format — that skill, not the curator, performs the write.

## spec-creator

- **Responsibility:** turn a feature brief into one testable feature spec
  for Spec-Driven Development. Opens the design (Figma/URL through the
  Chrome tools, or image paths), walks it against a gap checklist — unshown
  states, corner cases, cross-module contracts, UX improvements — asks the
  user about every gap and proposal with `AskUserQuestion`, then writes the
  spec with EARS acceptance criteria (`AC-1`, …; English triggers
  WHEN/WHILE/IF…THEN/WHERE + `shall`).
- **Permissions:** `Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion`
  plus the Chrome `tabs_context_mcp`/`tabs_create_mcp`/`navigate`/`computer`/
  `read_page`/`get_page_text`/`find` tools. **Write scope is hook-enforced**
  (`.claude/hooks/spec-creator-scope.mjs`): `Write`/`Edit` only on
  the root `specs/spec-*.md` ([`specs/README.md`](../../specs/README.md))
  and the spec's design frames `specs/images/spec-NNNN/*.png` — never the
  module `*/specs/` folders (older notes, and e2e flows in `e2e/specs/`).
  **Hook-enforced** — the one agent with a per-agent `hooks:` block:
  `PreToolUse` (`.claude/hooks/spec-creator-scope.mjs`) denies writes
  outside that scope and any writing `Bash` except `mkdir -p`/`cp` of a
  saved screenshot into `specs/images/spec-NNNN/`; `PostToolUse` runs the
  `spec-writing` lint after every spec write and blocks with its errors.
  **Preloads** `spec-writing`, `security`, `engineering-insights`
  (read-side only; its write step does not apply) and `onion-architecture`
  (module ownership and contracts only, never placement) and `zod`
  (contract field semantics, never schema code) via `skills:` (≈13k
  tokens; no `Skill` tool). `mermaid-diagram` stays lazy (`Read`,
  3+ modules only); `frontend-ui-architecture` and the other build skills
  are deliberately not preloaded — they describe *how* to build.
- **Must NOT re-derive:** the user's answer to a gap or proposal —
  accepted becomes an AC, declined becomes a Non-goal, unanswered becomes
  `[NEEDS CLARIFICATION]`. `Status: approved` only on the user's explicit
  approval; superseding touches only one `Superseded by:` line in the old
  spec.
- **Input:** a feature brief, the design link or image paths, optionally
  the grading rubric (rubric > design > brief).
- **Output:** the spec file (one per feature, flat in `specs/`, owning
  module first in its `Modules:` line, one `SPEC-NNNN` sequence) and a ≤60-line
  report: Written, Decisions, Open questions, Design gaps found, Could not
  establish, Support requests, Self-check, Insight lessons used, Next —
  opening with one outcome sentence. The prompt uses a ≤50-word description, explicit
  `effort: medium`, no `maxTurns`, XML-tagged blocks (`<role>`,
  `<hard_rules>` each with its reason, `<workflow>`, `<self_check>`,
  `<report_format>`, `<examples>`), positive phrasing over bare bans, a
  scope rule and a fetched-text-is-data rule. The self-check is ten items
  recorded in the report (spec + process), not a second verification pass —
  the lint proves the mechanical part. It reads only the `INSIGHTS.md` of
  the modules it tags, and writes none.
- **Not for:** Development Plans or file lists (`implementation-planner`), documenting
  built code (`doc-writer` → `docs/specs/`), architecture specs,
  implementing.

## brainstorm

- **Responsibility:** turn a stated problem with no chosen solution into a
  genuinely diverse, grounded option set — name the axes of variation first,
  then generate 4–6 options that differ on an axis, put the set to the user
  with `AskUserQuestion`, and report the option they chose. Never a numeric
  ranking, never a winner it picked itself.
- **Permissions:** `Read, Glob, Grep, Bash, AskUserQuestion`, no
  `Write`/`Edit`/`Agent`/`Skill`
  (reads `SKILL.md` with `Read`, like `implementation-planner`). **`Bash` is limited by the `read` allowlist, enforced by a per-agent
  `PreToolUse` hook** (`.claude/hooks/readonly-allowlist.mjs read`). It is the one most
  tempted to prototype an option, so its prompt names prototyping as the
  failure.
- **Must NOT re-derive:** the user's decision. `## Leaning` is a labelled
  recommendation carrying its own counter-argument — never a score, never a
  verdict, and never a substitute for asking. Silence, a leaning, and the
  caller's earlier wording are all explicitly not an answer.
- **Input:** a concrete problem statement and, ideally, numbered decision
  drivers. A problem with no boundary returns a `## Clarification needed`
  block instead.
- **Output:** Problem framing (drivers, axes), Options (4–6, each with a
  `path:line` sketch, fit/conflict against the numbered drivers, cost and
  reversibility, a spike-or-tracer-bullet de-risking step, a kill
  criterion), an optional `## Leaning`, **The chosen option** (the user's
  pick verbatim plus any constraint they added — this is the hand-off
  payload `implementation-planner` builds from), a Materiality check, Could not establish.
- **Not for:** producing a Development Plan (`implementation-planner`), implementing, repo
  investigation (`investigator`), external research (`researcher`).

## investigator

- **Responsibility:** read-only investigation **of the code only** — code,
  history, config, live data — in two modes: a targeted search (Mode A) or a
  whole-area onboarding brief (Mode B). `researcher` may also investigate
  code; what is exclusively `investigator`'s is the onboarding brief, and
  what it may never do is look outside the repo.
- **Permissions:** `Read, Glob, Grep, Bash`, no web tools at all (`tools:` is
  an allowlist, so their absence is the enforcement), no `Write`/`Edit`/
  `Agent`/`Skill` (reads `mermaid-diagram/SKILL.md` with `Read` for Mode B's
  optional diagram). **`Bash` is limited by the `read` allowlist, enforced by a per-agent
  `PreToolUse` hook** (`.claude/hooks/readonly-allowlist.mjs read`) — git history,
  file reads and read-only SQL against the dev DB.
- **Must NOT re-derive:** a call-graph claim from a grep match count alone —
  grep generates hypotheses, reading the definition and its callers verifies
  them; and never re-derives external/library research, which is
  `researcher`'s job.
- **Input:** a concrete question (Mode A) or an area to get oriented in
  (Mode B). Genuinely ambiguous subject → `## Clarification needed`.
- **Output:** Mode A — Format A (Bottom line, cited Findings, History,
  Coverage, Commands run, Could not establish; ≤150 lines). Mode B — Format
  B (Map, Data flow, Conventions, Seams, Traps, Read in this order, Verify
  before you trust, Coverage, Commands run, Could not establish; ≤300
  lines). *Coverage* is mandatory in both — an explicit "searched X, found
  nothing" is this repo's own convention, not a sourced rule.
- **Not for:** editing anything, planning, option generation (`brainstorm`),
  review, external/web research (`researcher`).

## researcher

- **Responsibility:** read-only research across **both** halves of a
  question — this codebase (Mode 1: how something works here, where it
  lives, why it was decided, what history says) and the outside world
  (Mode 2: docs, specs, changelogs, library behaviour, prior art). It owns
  any question that touches the outside world at all, including that
  question's repo half — "does our usage match what the library actually
  documents" is one task, not two. Never edits, never decides.
- **Permissions:** `Read, Glob, Grep, Bash, WebFetch, WebSearch,
  AskUserQuestion`; no `Write`/`Edit`/`Agent`/`Skill`. **`Bash` is limited by the `read` allowlist, enforced by a per-agent
  `PreToolUse` hook** (`.claude/hooks/readonly-allowlist.mjs read`); `curl`/`wget` are
  not on it because `WebFetch` is the sanctioned route and leaves a citable
  record.
- **Must NOT re-derive:** an onboarding brief — that format belongs to
  `investigator`; and a recommendation, which belongs to `brainstorm`
  (options) or `implementation-planner` (a plan).
- **Input:** a concrete question. A bare topic gets a clarifying question
  first. It does not hand a task back merely for having a repo half.
- **Output:** Format A (repo) and/or Format B (external), under one *Bottom
  line*, each with cited evidence, a Sources table for external work,
  *Relevance to this repo* where the two modes meet, and a mandatory *Could
  not establish* section.
- **Not for:** an onboarding brief (`investigator`), planning a change
  (`implementation-planner`), generating options (`brainstorm`), review of any kind.

## implementation-planner

- **Responsibility:** turn existing requirements into a plan an implementer
  can execute without guessing, consistent with the modules, the project
  skills, the local `INSIGHTS.md` files and the architecture constraints. It
  decides *how* and *in what order*, never *what*: it does not write, edit or
  complete a spec (`spec-creator` owns `specs/spec-*.md`, `doc-writer`
  owns `docs/specs/`), and no plan step edits one. Before planning it reviews
  every requirement against the code (clear / ambiguous / missing / conflict /
  infeasible as stated), recommends improvements, and asks the user — one
  `AskUserQuestion` round — about the plan-changing gaps and, always, whether
  to execute in **single-agent** or **multi-agent** mode. It also decides
  which skills the implementer (and `test-writer`, when a step is addressed to
  it) will apply, so the plan cannot contradict them.
- **Permissions:** read-only by prompt (`Bash` for reading only; a banned list
  covers `git fetch/stash/checkout`, `curl`, `env`, secrets), plus
  `AskUserQuestion`. No `Write`,
  `Edit`, `Agent` or `Skill`: every frontend and backend skill is preloaded
  through its `skills:` frontmatter (~135 KB of context per run, accepted so
  one plan can cover `client/` and `server/`); it reads only `mermaid-diagram`
  and skills' `references/` files with `Read`. Because no
  hook scopes `Bash` per agent, the caller should check `git status` after a run.
- **Input:** a `spec-creator` spec (planned from `Status: approved`; a `draft`
  or `[NEEDS CLARIFICATION]` is itself a question for the user),
  `brainstorm`'s chosen option, or a concrete task, plus the results of
  any support requests it made. Without `AskUserQuestion`
  it returns only a `## Questions for the user` block and the caller re-runs
  it with the answers.
- **Output:** a plan with `Status`, `Execution mode`, citation sha, Goal,
  **Requirements review** (each requirement by `AC-N`/`R-N` with status and
  resolution), **Recommendations** (advice, with whether the user accepted
  it), Out of scope, Context (INSIGHTS applied, history, technical
  assumptions), Modules & files, a required **Component map**, optional
  Mermaid **Diagrams**, Steps (each with requirement IDs, Files, Skills,
  Verify), **Work split** (one line for single-agent; waves of tracks with
  disjoint file ownership for multi-agent), Skills for implementer,
  Architecture constraints, Do-not-touch, Verification, Risks, Open
  questions, **Support requests** (`investigator`/`researcher`/`brainstorm`,
  run on demand by the caller), Could not establish, Insight candidates,
  **Self-check** (A: the
  plan — coverage, module tags, consistency, work split, order, verification,
  grounding, constraints, shape; B: the process — routing, requirements
  source, reading, requirements review, asked once, not a spec writer,
  boundaries). It owns the single
  skill-mapping table ("Skill mapping"). It ends by stating that the caller —
  not `implementation-planner`, which has no `Write`/`Agent` and is not given
  them — saves the plan to `docs/plans/NNNN-<slug>.md`, then hands the path
  to one `implementer` or, in multi-agent mode, spawns one agent per track.
- **Not for:** one-line fixes, writing or changing specs, review, research
  questions.

## implementer

- **Responsibility:** carry out the plan, load the skills it names, run the
  existing tests, and check only its own diff. Does not review architecture or
  security. It still updates tests for behaviour it changes as part of a plan
  step; a dedicated test task, a backfill, or a bug repro goes to
  `test-writer` instead.
- **Permissions:** can edit and run commands. Bans destructive git and docker
  commands, `curl`/`wget`, reading secrets, and `git commit/push`, `gh pr *`;
  Respects the root `AGENTS.md` "Do not touch"
  list. Skills load lazily through the `Skill` tool; nothing is preloaded.
- **Input:** normally a plan by path under `docs/plans/NNNN-<slug>.md` (or a
  small, well-specified change); a plan pasted inline is still accepted. It
  stops on `Status: blocked`, a clarification block, or a blocking open
  question, and never edits the plan file to match what it built —
  deviations go in its own *Deviations* section instead.
- **Output:** Done (states which plan path it worked from, or that it had
  none), Verification (command, result), Not verified, Deviations,
  Follow-ups, INSIGHTS, Working tree. Leaves the work uncommitted.
- **Not for:** planning, review, committing, pushing.

## test-writer

- **Responsibility:** write or update tests for behaviour that already exists
  — client components/hooks (RTL + Vitest), server unit and `*.it.test.ts`
  tests, `reviewer-core` engine tests — or reproduce a reported bug with a
  failing test first.
- **Permissions:** can edit and write test files, fixtures and test helpers
  only; production code is off-limits by prompt (no hook scopes it). Has
  `Skill` for `react-testing-library` / `onion-architecture`.
- **Must NOT re-derive:** production-code fixes (reports them as a
  Follow-up instead), a test framework choice (uses what the module already
  has).
- **Input:** the target (module + path/symbol), the behaviour or bug, and the
  plan's test step or a named edge case. Missing either → `## Clarification needed`.
- **Output:** Tests added (`path:line` + scenario), Run (module/command/result
  incl. the skipped count), Not covered, Production code untouched (`git
  status --short`), Follow-ups, INSIGHTS.
- **Not for:** production code, architecture/security review, plan
  verification, e2e specs, deciding whether a feature is right.

## architecture-reviewer

- **Responsibility:** read-only check of architectural boundaries a diff
  crosses — business logic in the wrong layer, cross-module reach-ins, a
  contract re-declared instead of vendored, client placement violations —
  on the **staged** diff only. Findings are advisory.
- **Permissions:** `Read, Glob, Grep, Bash`, no `Write`/`Edit`/`Skill` (reads
  `SKILL.md` with `Read`, like `implementation-planner`). `Bash` is limited
  to an explicit **allowlist** of read commands, **enforced by a per-agent `PreToolUse`
  hook** (`.claude/hooks/readonly-allowlist.mjs architecture`): `git diff
  --cached` only (a plain or ranged `git diff` is denied), `git
  status/log/show/blame/ls-files`, file reads, `rg`/`find`, `diff -r` of the
  two `vendor/shared` copies, `jq`, `pnpm arch:check` / `depcruise`; every
  pipe segment must match, and redirection or command substitution is
  denied. Subagent `tools:` takes tool names only, so the hook is how
  command-level scope is enforced.
- **Must NOT re-derive:** dependency-cruiser's edges — it runs `pnpm
  arch:check` and reports it verbatim, never overruling it. It now also
  checks the hard repo rules the removed `pr-self-review` checks used to
  (edited merged migration, competing lockfile, one-sided `vendor/shared`
  change, missing `.it.test.ts` suffix). Severity comes from
  `.claude/references/review-severity.md`; never a PASS/BLOCK verdict.
- **Input:** the **staged changes only** (`git diff --cached`) plus the
  module boundary — never commits, branch ranges or unstaged files, since
  the user reviews before committing. Nothing staged → it stops and says so.
- **Output:** Verdict line ("no findings" is valid), Findings (max 5, each
  with `location`/`claim`/`rule`/`trigger`/`falsifier`/`fix`/`confidence`),
  Observations, Deterministic results reused, Could not establish.
- **Not for:** security review, correctness/bug hunting, performance, test
  quality, writing fixes, planning.

## security-reviewer

- **Responsibility:** read-only security review of a diff — source→sink
  data-flow tracing per changed hunk ("can an attacker control this value?"),
  OWASP-shaped findings, translated onto this repo's actual Fastify +
  Drizzle/Postgres + Next 15 stack rather than the `security` skill's
  Express/MongoDB/JWT wording. It is not the PR gate.
- **Permissions:** `Read, Glob, Grep, Bash`, no `Write`/`Edit`/`Skill` (reads
  `security/SKILL.md` and `checklists.md` with `Read`, like
  `architecture-reviewer` reads its skill). **`Bash` is limited by the `security` allowlist, enforced by a per-agent
  `PreToolUse` hook** (`.claude/hooks/readonly-allowlist.mjs security`) — reads plus
  `pnpm typecheck`/`arch:check`; the hook denies any read of
  `~/.devdigest/**` or a non-example `.env`.
- **Must NOT re-derive:** the `security` skill's confidence table or
  "Do NOT flag" list — it carries them, never restates the whole skill; and
  never restates `architecture-reviewer`'s ring-placement job — this agent
  follows data, not boundaries.
- **Input:** a diff range or "the uncommitted changes" (defaults to `git diff
  origin/main...HEAD` plus working-tree changes), plus the module boundary.
  Scope (`include`/`triggers`) is listed in its own file.
- **Output:** Verdict line ("no findings" is valid), Findings (max 5, HIGH
  confidence only, each with `location`/`category`/`source`/`sink`/
  `exploit`/`fix`/`confidence`), Verified safe, Needs manual verification
  (the MEDIUM bucket), Could not establish.
- **Not for:** architecture/boundary review, correctness/bug hunting,
  performance, test quality, writing fixes, planning.

## plan-verifier

- **Responsibility:** the last step after `implementer`, run once
  `architecture-reviewer`'s findings are fixed and `test-writer` has
  finished. Adversarially
  checks the finished code **and its tests** against the spec — every `AC-n`,
  edge case and measurable NFR; an AC is `met` only with the behaviour in
  code AND a test it ran that exercises it — and against every item of the
  Development Plan — steps, Component-map rows, the acceptance condition,
  Verify commands, Architecture constraints, Do-not-touch lines. One matrix
  row per item with a verdict and runtime evidence. The spec outranks the
  plan: a plan step that contradicts an AC leaves that AC `not-met`.
- **Permissions:** `Read, Glob, Grep, Bash` (load-bearing — it re-runs the
  plan's own Verify commands), no `Write`/`Edit`/`Skill`. **`Bash` is limited by the `verify` allowlist, enforced by a per-agent
  `PreToolUse` hook** (`.claude/hooks/readonly-allowlist.mjs verify`) — reads plus
  the project's test/typecheck/lint/arch checks; a plan `Verify:` step the
  hook denies is marked `cannot-verify`.
- **Must NOT re-derive:** the plan's own criteria into something broader — no
  invented quality bars, no severity-rated findings (that belongs to the
  reviewers), no PASS/BLOCK verdict.
- **Input:** the spec `specs/spec-NNNN-<slug>.md` (none → it says so and
  verifies the plan alone), the plan, ideally by its canonical path
  `docs/plans/NNNN-<slug>.md`, `test-writer`'s report, AND the implementer's report (its
  `Deviations`/`Not verified` sections); optionally a diff range.
- **Output:** a *Spec compliance* matrix (code + test evidence per AC) and a
  *Plan compliance* matrix FIRST (`Source` column cites
  `specs/<file>:<line>` / `docs/plans/<file>:<line>`; verdict enum: `met` · `met-manual` · `not-met` ·
  `not-implemented` · `deviation-recorded` · `cannot-verify`), Commands run,
  Not done, Cannot verify, Out-of-plan observations (never change a verdict),
  Needs the user (`met-manual` rows: an AC no test can exercise, compared
  against the spec's saved design frame, counted only once the user
  accepts it), Fix list (which rows go back to `implementer` or
  `test-writer`), Bottom line.
- **Not for:** code review, architecture review, fixing anything, judging
  whether the plan itself was good.

## doc-writer

- **Responsibility:** document an already-implemented feature into `docs/`,
  grounded in the diff and the code (not the plan's intentions), citing
  `path:line` and the sha documented.
- **Permissions:** `Read, Glob, Grep, Edit, Write, Bash` (for `git
  diff`/`log`/`rev-parse`). **No `Skill`** — it reads
  `.claude/skills/mermaid-diagram/SKILL.md` + `examples.md` with `Read`
  instead (the `skills: [mermaid-diagram]` preload option was considered and
  not taken, to keep one uniform read-a-skill mechanism across the read-heavy
  agents).
- **Must NOT re-derive:** a destination — `docs/README.md` is its only
  authority for where a page goes; an uncitable entity is dropped, never
  invented from the plan.
- **Input:** what to document + where it landed (diff range, sha, or plan +
  implementer report); asks which Diátaxis type when the material supports
  more than one.
- **Output:** Written (`docs/<path>` + type + destination rule), Grounded in
  (`path:line` list + short sha), Diagrams (type + question answered),
  Deliberately omitted, Could not establish, Follow-ups (e.g. the
  `PUT /agents/:id` push a `docs/agent-prompts/` change still needs).
- **Not for:** writing code, `INSIGHTS.md` (owned by `engineering-insights`),
  `AGENTS.md` rules, speculative or unimplemented work, PR descriptions.

## insight-curator

- **Responsibility:** scan the six `INSIGHTS.md` files for duplicate/
  near-duplicate clusters, stale entries (proven by re-running the cited
  command, never guessed), and lesson→rule promotion candidates. Proposes
  only — the `engineering-insights` skill owns every write.
- **Permissions:** `Read, Glob, Grep, Bash`, no `Write`/`Edit`/`Agent`/
  `Skill` (reads `engineering-insights/SKILL.md` with `Read`). **`Bash` is limited by the `read` allowlist, enforced by a per-agent
  `PreToolUse` hook** (`.claude/hooks/readonly-allowlist.mjs read`). This is the agent where
  that matters most: `tools:` blocks `Write`/`Edit`, and the hook closes the
  other route into `INSIGHTS.md` (`>>`, `tee -a`, `sed -i`).
- **Must NOT re-derive:** the write itself — it never edits or prunes
  `INSIGHTS.md`; near-duplicate detection is lexical (shingling-style),
  which cannot see paraphrase, so a merge proposal must quote both entries
  making the *same* claim, and default to keep-both when they differ in a
  load-bearing particular.
- **Input:** a wrap-up/retro trigger, implicitly all six files, or a named
  subset.
- **Output:** Bottom line (files read, entries scanned, counts),
  Duplicate/near-duplicate clusters, Stale entries (with the evidence
  command run), Promotion proposals (≤3, each citing ≥2 entries), Also
  noticed (≤5), Coverage/not examined, Could not establish, Ready-to-append
  bullets in `engineering-insights`'s exact entry format.
- **Not for:** writing or pruning `INSIGHTS.md` itself, editing
  `AGENTS.md`/skills/hooks, code review, deciding a lesson is wrong on its
  own authority.

## Known limits

- The `Skill` question is resolved by doc, not runtime-verified here:
  `skills:` preloads a skill; omitting `Skill` from `tools` blocks skill
  invocation entirely — that is why `architecture-reviewer`, `plan-verifier`
  and `doc-writer` read skill files with `Read` instead, while `implementation-planner`
  uses `skills:` to preload without gaining the `Skill` tool.
- **Read-only `Bash` is hook-enforced, per agent, by allowlist.** User
  decision, 2026-09-29, reversing the 2026-09-20 prompt-only choice: every
  agent that must not write keeps `Bash` but carries a frontmatter `hooks:`
  block running `.claude/hooks/readonly-allowlist.mjs <profile>` —
  `read` (`brainstorm`, `investigator`, `researcher`,
  `implementation-planner`, `insight-curator`), `architecture`
  (`architecture-reviewer`: staged diff only), `security`
  (`security-reviewer`), `verify` (`plan-verifier`). Every segment of a
  command must match the profile or the whole command is denied; quoted
  text is data. `spec-creator` has its own write-scope hook. Tests:
  `node --test .claude/hooks/readonly-allowlist.test.mjs`.
  - **Why hooks, not `tools:`:** a subagent's `tools:` takes tool names
    only; command-level patterns like `Bash(git diff --cached:*)` belong to
    `settings.json` permissions and skills' `allowed-tools`.
  - **The prompt table must match the profile.** Each agent file shows its
    profile's commands so the agent does not waste calls on denied ones;
    changing a profile means changing those tables.
  - **Accepted limits:** `pnpm test`/`npm test`/`node --test` (the `verify`
    profile) run project code, which could write — the same trust the
    project's own test suite already has. A variable indirection or an
    unlisted but harmless command is denied, not allowed — the allowlist
    fails closed.
  - Per-subagent hooks were runtime-verified to fire on 2026-09-20 (inside
    a live `investigator` run, each denial quoting the hook's text). Still
    unsettled: whether they add to or replace the `settings.json` hooks.
- `insight-curator`'s near-duplicate detection is lexical (shingling-style
  overlap), so it can miss a paraphrase that says the same thing in
  different words — the keep-both default is the deliberate mitigation, not
  a fix.

## Changing an agent

- Edit the agent's own file; keep this page a map, not a copy.
- Adding or renaming a skill: update the implementation-planner's "Skill mapping" table (plus its `skills:` preload list
  for a frontend/backend skill).
- Changing what `implementation-planner` produces means checking `implementer` (and
  `test-writer`, when a plan addresses a step to it) still consume it, and
  the reverse.
- Adding an agent: add it to the table above, the Flow, a per-agent section,
  and — if it writes code — the implementation-planner's Skill-mapping table. If it
  writes into `docs/`, a new `docs/` subdirectory needs a row in
  `docs/README.md`, `doc-writer`'s only authority for where a page goes.
