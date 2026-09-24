# Agents

Map of the subagents in `.claude/agents/`. Each agent's file is the source of
truth for its rules; this page only says what exists, who does what, and where
the rules come from. Skills live in [../skills/README.md](../skills/README.md).

## At a glance

| Agent | Job | Model | Tools | Writes files |
|---|---|---|---|---|
| [`brainstorm`](brainstorm.md) | Generates 4–6 grounded, materially distinct options, then asks the user which one | `opus` | `Read, Glob, Grep, Bash, AskUserQuestion` | no |
| [`investigator`](investigator.md) | Read-only investigation **of the code only**: targeted search, or a whole-area onboarding brief | `sonnet` | `Read, Glob, Grep, Bash` | no |
| [`researcher`](researcher.md) | Answers questions needing the outside world — **code and web both** — with cited evidence | `sonnet` | `Read, Glob, Grep, Bash, WebFetch, WebSearch, AskUserQuestion` | no |
| [`planner`](planner.md) | Turns a task into a structured Development Plan | `opus` | `Read, Glob, Grep, Bash` | no |
| [`implementer`](implementer.md) | Executes a plan in `client/`, `server/`, `reviewer-core/` and verifies its own changes | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash, Skill` | yes (code, tests, INSIGHTS) |
| [`test-writer`](test-writer.md) | Writes or updates tests for existing behaviour, or reproduces a bug with a failing test | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash, Skill` | yes (tests only) |
| [`architecture-reviewer`](architecture-reviewer.md) | Read-only architecture review of a diff: boundaries the mechanical checks can't see | `opus` | `Read, Glob, Grep, Bash` | no |
| [`security-reviewer`](security-reviewer.md) | Read-only security review of a diff: source→sink data-flow tracing, OWASP-shaped, repo-aware | `opus` | `Read, Glob, Grep, Bash` | no |
| [`plan-verifier`](plan-verifier.md) | Adversarial per-item check of finished code against a Development Plan | `opus` | `Read, Glob, Grep, Bash` | no |
| [`doc-writer`](doc-writer.md) | Documents an already-implemented feature into `docs/`, grounded in the diff | `sonnet` | `Read, Glob, Grep, Edit, Write, Bash` | yes (docs only) |
| [`insight-curator`](insight-curator.md) | Scans `INSIGHTS.md` for duplicate/stale entries and lesson→rule promotions; proposes, never writes | `opus` | `Read, Glob, Grep, Bash` | no |

None of the eleven has `Agent`, so none can spawn subagents. None commits or
pushes. Architecture review is an agent (`architecture-reviewer`) and so is
security review (`security-reviewer`); `/pr-self-review` remains the gate
either way — an agent's findings are advisory, the gate is what blocks a push.

## Flow

```
question touching the outside world ──► researcher ──► report (code + web evidence, sources, gaps)
question inside the code only, or onboarding ──► investigator ──► Format A report, or Format B onboarding brief

problem, no solution yet ──► brainstorm ──► 4–6 options ──► asks the user ──► the chosen option ──► planner
                                                investigator ···► grounding ···► brainstorm / planner

task ──► planner ──► Development Plan ──► saved to docs/plans/NNNN-<slug>.md
                        ├─► implementer ──► change report
                        │                     ├─► plan-verifier ──► compliance matrix
                        │                     ├─► architecture-reviewer ──► findings/observations
                        │                     ├─► security-reviewer ──► findings/verified-safe
                        │                     └─► doc-writer ──► docs/
                        └─► test-writer ──► tests added (a plan step, or standalone)

                                    (user only) ──► /pr-self-review ──► PASS/BLOCK gate

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
`investigator` also feeds `brainstorm` and `planner` as optional grounding
(dotted line: a distillation, not a hard dependency — both agents can read
the repo themselves). `brainstorm` sits upstream of `planner`: it generates
options and then **asks the user directly** with `AskUserQuestion` — the
agent never picks, and never reads a `## Leaning` or the caller's earlier
wording as the answer. It reports the chosen option in a dedicated section,
and `planner` builds the Development Plan from that section alone. The
caller (not `planner` — it has no `Write`) saves the plan to
`docs/plans/NNNN-<slug>.md` before handing the path to `implementer`
(`docs/README.md` "Plans — the rule"). `planner` and
`implementer` are a pair: the plan is the contract between them.
`test-writer`, `plan-verifier`,
`architecture-reviewer`, `security-reviewer` and `doc-writer` all consume
either a plan or an implementer's report (or both) and never edit production
code (`test-writer` edits only test files; `doc-writer` edits only `docs/`). `insight-curator`
sits on the wrap-up lane: it reads the `INSIGHTS.md` files and proposes
duplicate/stale/promotion bullets in the `engineering-insights` skill's exact
format — that skill, not the curator, performs the write.

## brainstorm

- **Responsibility:** turn a stated problem with no chosen solution into a
  genuinely diverse, grounded option set — name the axes of variation first,
  then generate 4–6 options that differ on an axis, put the set to the user
  with `AskUserQuestion`, and report the option they chose. Never a numeric
  ranking, never a winner it picked itself.
- **Permissions:** `Read, Glob, Grep, Bash, AskUserQuestion`, no
  `Write`/`Edit`/`Agent`/`Skill`
  (reads `SKILL.md` with `Read`, like `planner`). **Read-only for `Bash` is
  prompt-enforced only** — no hook guards it; the agent carries an explicit
  allowed/denied command list. It is the one most tempted to prototype an
  option to see if it works, so that list names prototyping as the failure.
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
  payload `planner` builds from), a Materiality check, Could not establish.
- **Not for:** producing a Development Plan (`planner`), implementing, repo
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
  optional diagram). **Read-only for `Bash` is prompt-enforced only** — no
  hook guards it; the agent carries an explicit allowed/denied command list.
  It is the heaviest `Bash` user of the read-only agents, so that list is the
  longest.
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
  AskUserQuestion`; no `Write`/`Edit`/`Agent`/`Skill`. **Read-only for
  `Bash` is prompt-enforced only** — no hook guards it; the agent carries an
  explicit allowed/denied command list, in which `curl`/`wget` are denied
  specifically because `WebFetch` is the sanctioned route and leaves a
  citable record.
- **Must NOT re-derive:** an onboarding brief — that format belongs to
  `investigator`; and a recommendation, which belongs to `brainstorm`
  (options) or `planner` (a plan).
- **Input:** a concrete question. A bare topic gets a clarifying question
  first. It does not hand a task back merely for having a repo half.
- **Output:** Format A (repo) and/or Format B (external), under one *Bottom
  line*, each with cited evidence, a Sources table for external work,
  *Relevance to this repo* where the two modes meet, and a mandatory *Could
  not establish* section.
- **Not for:** an onboarding brief (`investigator`), planning a change
  (`planner`), generating options (`brainstorm`), review of any kind.

## planner

- **Responsibility:** produce a plan an implementer can execute without
  guessing, consistent with the modules, the project skills, the local
  `INSIGHTS.md` files and the architecture constraints. It also decides which
  skills the implementer (and `test-writer`, when a step is addressed to it)
  will apply, so the plan cannot contradict them.
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
  reading"). It ends by stating that the caller — not `planner`, which has
  no `Write` and is not given one — saves the plan to
  `docs/plans/NNNN-<slug>.md` before handing the path to `implementer`.
- **Not for:** one-line fixes, review, research questions.

## implementer

- **Responsibility:** carry out the plan, load the skills it names, run the
  existing tests, and check only its own diff. Does not review architecture or
  security. It still updates tests for behaviour it changes as part of a plan
  step; a dedicated test task, a backfill, or a bug repro goes to
  `test-writer` instead.
- **Permissions:** can edit and run commands. Bans destructive git and docker
  commands, `curl`/`wget`, reading secrets, and `git commit/push`, `gh pr *`;
  never runs `/pr-self-review`. Respects the root `AGENTS.md` "Do not touch"
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
  has), what `.it.test.ts` naming already enforces (`checks.mjs:201-220`).
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
  contract re-declared instead of vendored, client placement violations. It
  is not the PR gate.
- **Permissions:** `Read, Glob, Grep, Bash`, no `Write`/`Edit`/`Skill` (reads
  `SKILL.md` with `Read`, like `planner`). **Read-only for `Bash` is
  prompt-enforced only** — no hook guards it; the agent carries an explicit
  allowed/denied command list, which permits the read-only project checks it
  needs (`pnpm arch:check`, `depcruise`).
- **Must NOT re-derive:** everything `checks.mjs` already proves (migrations,
  lockfiles, `vendor/shared` drift, secrets, `.it.test.ts` naming,
  dependency-cruiser edges, diff size) — it runs `pnpm arch:check` itself and
  reports it verbatim, never overruling dependency-cruiser. Never produces a
  PASS/BLOCK verdict, never writes `.devdigest/self-review/**`, never runs
  `verdict.mjs`/`prepare.mjs`/`/pr-self-review`.
- **Input:** a diff range or "the uncommitted changes" (defaults to `git diff
  origin/main...HEAD` plus working-tree changes), plus the module boundary.
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
  `architecture-reviewer` reads its skill). **Read-only for `Bash` is
  prompt-enforced only** — no hook guards it; the agent carries an explicit
  allowed/denied command list, which specifically denies any read of
  `~/.devdigest/**` or a non-example `.env`.
- **Must NOT re-derive:** the `security` skill's confidence table or
  "Do NOT flag" list — it carries them, never restates the whole skill; and
  never restates `architecture-reviewer`'s ring-placement job — this agent
  follows data, not boundaries.
- **Input:** a diff range or "the uncommitted changes" (defaults to `git diff
  origin/main...HEAD` plus working-tree changes), plus the module boundary.
  Scoped by `pr-self-review/references/routing.json`'s `security` entry
  (`include`/`triggers`).
- **Output:** Verdict line ("no findings" is valid), Findings (max 5, HIGH
  confidence only, each with `location`/`category`/`source`/`sink`/
  `exploit`/`fix`/`confidence`), Verified safe, Needs manual verification
  (the MEDIUM bucket), Could not establish.
- **Not for:** architecture/boundary review, correctness/bug hunting,
  performance, test quality, writing fixes, planning, replacing
  `/pr-self-review`.

## plan-verifier

- **Responsibility:** adversarially check finished code against every item of
  a Development Plan — steps, Component-map rows, the acceptance condition,
  Verify commands, Architecture constraints, Do-not-touch lines — and return
  one matrix row per item with a verdict and runtime evidence.
- **Permissions:** `Read, Glob, Grep, Bash` (load-bearing — it re-runs the
  plan's own Verify commands), no `Write`/`Edit`/`Skill`. **Read-only for
  `Bash` is prompt-enforced only** — no hook guards it; the agent carries an
  explicit allowed/denied command list, and a plan `Verify:` step that writes
  is declined and the item marked `cannot-verify`.
- **Must NOT re-derive:** the plan's own criteria into something broader — no
  invented quality bars, no severity-rated findings (that vocabulary belongs
  to `pr-self-review`'s Verifier template), no PASS/BLOCK verdict.
- **Input:** the plan, ideally by its canonical path
  `docs/plans/NNNN-<slug>.md`, AND the implementer's report (its
  `Deviations`/`Not verified` sections); optionally a diff range.
- **Output:** a compliance matrix FIRST (`Source` column cites
  `docs/plans/<file>:<line>`; verdict enum: `met` · `not-met` ·
  `not-implemented` · `deviation-recorded` · `cannot-verify`), Commands run,
  Not done, Cannot verify, Out-of-plan observations (never change a verdict),
  Bottom line.
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
  `Skill` (reads `engineering-insights/SKILL.md` with `Read`). **Read-only
  for `Bash` is prompt-enforced only** — no hook guards it. This is the agent
  where that costs most: `tools:` blocks `Write`/`Edit`, but `>>`, `tee -a`
  and `sed -i` remain a live route into `INSIGHTS.md`, so its command list
  names them first and explains why reaching for one is the exact failure the
  agent exists to avoid.
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

## Sources behind the rules

Retrieved 2026-09-20. The Claude Code pages were read through a summarising
model, so quote wording should be re-checked against the live page before it is
cited elsewhere. The subagent frontmatter schema (`name`, `description`,
`tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`,
`mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`,
`isolation`, `color`, `initialPrompt`, `experimental`) is taken from source A
and is **not runtime-verified in this repo**.

| # | Source | Type |
|---|---|---|
| A | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) | Anthropic docs |
| B | [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) | Anthropic docs |
| C | [Extend Claude with skills](https://code.claude.com/docs/en/skills) | Anthropic docs |
| D | [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Anthropic docs |
| E | [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Anthropic engineering |
| F | [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Anthropic engineering |
| G | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Anthropic engineering |
| H | [Test behavior, not implementation](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html) | Testing on Toilet (search summary) |
| I | [Guiding Principles](https://testing-library.com/docs/guiding-principles/) | Testing Library docs (search summary) |
| J | [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) | Martin Fowler (search summary) |
| K | [UnitTest](https://martinfowler.com/bliki/UnitTest.html) | Martin Fowler (search summary) |
| L | [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) | Martin Fowler |
| M | [Introducing Testcontainers](https://testcontainers.com/guides/introducing-testcontainers/) | Testcontainers (search summary) |
| N | [arXiv:2602.07900](https://arxiv.org/abs/2602.07900) | paper |
| O | [Permissions](https://code.claude.com/docs/en/permissions) | Anthropic docs |
| P | [The Diátaxis framework](https://www.diataxis.fr/) | Diátaxis |
| Q | [Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | Cognitect (URL via search, not fetched) |
| R | [ADR templates](https://adr.github.io/adr-templates/) | ADR GitHub org (search summary) |
| S | [arXiv:2504.08725 (DocAgent)](https://arxiv.org/pdf/2504.08725) | paper (search summary) |
| T | [arXiv:2502.00519 (CoDocBench)](https://arxiv.org/pdf/2502.00519) | paper (search summary) |
| U | [Docs as Code](https://falconer.com/guides/docs-as-code/) | vendor guide (secondary) |
| V | [Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html) | Mermaid docs |
| W | [How to prompt for a genuinely useful code review](https://prompt-architects.com/blog/106-how-to-prompt-for-a-genuinely-useful-code-review) | practitioner (secondary) |
| X | [Claude Code code review](https://code.claude.com/docs/en/code-review) | Anthropic docs |
| Y | [Deep code review: recall vs. precision](https://www.augmentcode.com/guides/deep-code-review-recall-vs-precision) | vendor (directional only) |
| Z | [AI code review false positives](https://www.codeant.ai/blogs/ai-code-review-false-positives) | vendor (directional only) |
| AA | [Architecture drift reduction with LLMs](https://www.thoughtworks.com/radar/techniques/architecture-drift-reduction-with-llms) | Thoughtworks Radar (summarizing pass) |
| AB | [archfit](https://github.com/alexei-led/archfit) | tool repo |
| AC | [arXiv:2306.05685](https://arxiv.org/abs/2306.05685) | paper |
| AD | [Your judge is not an independent reviewer](https://khaledzaky.com/blog/your-judge-is-not-an-independent-reviewer/) | practitioner (secondary) |
| AE | [SWE-125 Requirements Compliance Matrix](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695489/SWE-125+-+Requirements+Compliance+Matrix) | NASA SWEHB |
| AF | [Definition of Done](https://github.com/addyosmani/agent-skills/blob/main/references/definition-of-done.md) | practitioner |
| AG | [arXiv:2606.08625v2](https://arxiv.org/html/2606.08625v2) | paper |
| AH | [Reward hacking](https://lilianweng.github.io/posts/2024-11-28-reward-hacking/) | Lilian Weng |
| AI | arXiv:2604.18005 — diversity collapse in multi-agent LLM ideation | preprint, search summary |
| AJ | arXiv:2510.01171 — Verbalized Sampling / typicality bias | preprint, search summary |
| AK | arXiv:2310.13548 — Towards Understanding Sycophancy (Anthropic) | paper, search summary |
| AL | Design Docs at Google (industrialempathy.com) | insider account, secondary, fetched |
| AM | danlebrero — the belligerent contrarian and the rule of three | practitioner, secondary (explicitly not validated) |
| AN | zzet.org — code search for AI agents: grep vs symbol resolution | practitioner, secondary, fetched |
| AO | GAO-01-1015R — Survey of NASA's Lessons Learned Process | primary, fetched |
| AP | Nextgov — NASA LLIS cost and underuse | secondary, search summary |
| AQ | PMI — Lessons Learned: Sharing Knowledge | standards-body, **search summary, not fetched** |
| AR | Retromat — What's a good action item? | practitioner, fetched (**do not attribute to Google SRE**) |
| AS | Google SRE Book — Postmortem Culture | primary, fetched |
| AT | Broder et al. 1997 — Syntactic Clustering of the Web (shingling/MinHash) | paper, search summary |
| AU | Claude Code docs — How Claude remembers your project | Anthropic docs, fetched |
| AV | [Tracer Bullets and Prototypes](https://www.artima.com/articles/tracer-bullets-and-prototypes) | secondary, search summary |
| AW | [When to use multi-agent systems (and when not to)](https://www.claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) | Anthropic blog, fetched — the 3–10x-cost figure and the "telephone game" framing |

Reuses existing letters where they already cover a claim: **AC** (arXiv:2306.05685,
LLM-judge bias) for brainstorm's no-self-ranking rule; **Q**/**R** (ADR + MADR,
superseded/deprecated) for `insight-curator`'s correction convention; **G**
(sectioning vs voting, one consideration per call) and **E** (~15x tokens,
division-of-labour failures, vague instructions) and **F** (context isolation,
1,000–2,000-token distillation) for `investigator`'s routing and length caps;
**A** (routing on `description`; frontmatter schema) for all three.

### brainstorm

| Rule in the agent | Based on |
|---|---|
| Name axes of variation before options, materiality test over sampling N times | AJ |
| Diversity collapses without deliberate structure in multi-agent ideation | AI |
| No numeric scores or aggregate winner; a single labelled recommendation is allowed | AC |
| Anti-sycophancy: a preferred option still gets its strongest counter-case | AK |
| Per-option required fields (sketch, drivers, cost/reversibility, kill criterion) | this repo's convention |
| "Rejected options tied to the drivers they fail" — a useless alternatives section is the failure mode | AL |
| Spike vs. tracer bullet as the de-risking-step vocabulary | AV |
| "Rule of three" is a practitioner heuristic, not a controlled study; 4 is this repo's convention | AM |
| MADR's Considered Options / Decision Drivers shape the per-option fields | Q, R |

### investigator

| Rule in the agent | Based on |
|---|---|
| Grep generates hypotheses; reading the definition and callers verifies them | AN |
| Routing is unambiguous by `description`; a "both" question splits explicitly | A, AW |
| Mandatory coverage/negative-result statement, `path:line` on every claim | this repo's convention |
| Length caps from context isolation and subagent token cost | F, E |
| Mode B diagram: read `mermaid-diagram/SKILL.md` with `Read`, never `Skill` | this repo's convention (root INSIGHTS.md:49) |

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

### test-writer

| Rule in the agent | Based on |
|---|---|
| Assert on observable behaviour, never internals | H, I |
| Double only what is outside our control | J, K |
| Container tests only when the behaviour is real Postgres | M |
| One `expect` per named scenario, no debug prints | N |

### architecture-reviewer and plan-verifier

| Rule in the agent | Based on |
|---|---|
| Fixed evidence schema with a falsifier; cap findings; no-findings is valid | W, X |
| Precision over recall because a human reads it last | Y, Z |
| The deterministic tool owns the mechanical rule | AA, AB |
| The reviewer is a fresh, separate agent | AC, AD |
| One matrix row per plan item, verdict + evidence | AE |
| Verdict enum includes `not-implemented` and `cannot-verify` | AE, AF |
| Criteria are exactly the plan's items | AG |
| Framed adversarially, decoupled from the implementer | AH |

### doc-writer

| Rule in the agent | Based on |
|---|---|
| Content type decides destination | P |
| Decisions get an ADR with rejected alternatives | Q, R |
| Cite `path:line`; an uncitable entity is dropped | S, T |
| Document against the diff, record the sha | U |
| Pick the diagram by the question; source in the same commit | V |

### insight-curator

| Rule in the agent | Based on |
|---|---|
| Append-only; propose a `Supersedes` bullet instead of editing an existing one | this repo's convention (`engineering-insights/SKILL.md`) |
| Superseded vs. deprecated as the two ways an entry stops being current | Q, R |
| Near-duplicate detection is lexical (shingling), can't see paraphrase; keep-both default guards over-merging | AT |
| Lesson→rule promotion targets a system (hook/skill/AGENTS.md), never a person | AS |
| Caps on clusters/stale/promotions are this repo's choice, not a sourced rule | AR (2–3 action items per retro, a heuristic) |
| Propose rather than rewrite — the silent-write vs. reviewable-proposal asymmetry | AU |
| A lessons-learned process that goes unread or unenforced has no effect — motivates the mandatory evidence command | AO, AP, AQ |

### Repo rules the agents encode

These come from the repo, not from the sources above: the "Do not touch" list,
the no-commit-until-asked rule, the INSIGHTS start/end loop and the
one-package-manager-per-package rule (root [AGENTS.md](../../AGENTS.md)); the
shared-worktree and stash hazards, and the `db:migrate` shared-volume trap
(root [INSIGHTS.md](../../INSIGHTS.md)).

## Known limits

- The `Skill` question is resolved by doc, not runtime-verified here:
  `skills:` preloads a skill; omitting `Skill` from `tools` blocks skill
  invocation entirely — that is why `architecture-reviewer`, `plan-verifier`
  and `doc-writer` read skill files with `Read` instead.
- **No hook enforces read-only `Bash`.** Project decision, 2026-09-20: the
  agent set relies on the `tools:` allowlist and on skills, not on custom
  hook scripts. `tools:` is real enforcement — an agent without `Write`/
  `Edit` cannot edit a file, and `researcher` without `Bash` cannot run a
  command at all. But `Bash` itself is not scoped by anything, so for the seven
  agents that keep it (`architecture-reviewer`, `security-reviewer`,
  `plan-verifier`, `brainstorm`, `investigator`, `insight-curator`,
  `planner`) read-only is a prompt rule.
  Each of those files carries an explicit allowed/denied command list rather
  than a vague "be read-only": when the prompt is the only line, it has to be
  specific.
  - **What this gives up, stated plainly:** `>`/`>>`, `tee`, `sed -i`, `rm`,
    `npx`, `curl`, `git commit`/`push`, and reading
    `~/.devdigest/secrets.json` are no longer mechanically impossible for
    those agents — only forbidden. The two `.claude/settings.json` hooks are
    untouched and still apply to every session, so the `/pr-self-review` push
    gate and the rebase-before-commit gate are unaffected.
  - **The list is duplicated across the agent files on purpose.** A single
    shared copy read at runtime (a skill, a referenced file) would be one
    edit instead of six, but an agent that forgets to read it is unguarded.
    In-context beats single-source when the text *is* the enforcement.
    Changing one copy means changing all of them.
  - It was runtime-verified before removal that a per-subagent `hooks:` block
    does fire — inside a live `investigator` run, `npx --version` and a
    secrets read were both blocked, each quoting the hook's own deny text —
    so this is a deliberate trade, not a workaround for something that did
    not work. Now moot, and never settled: whether per-subagent hooks add to
    or replace the `settings.json` hooks.
- `insight-curator`'s near-duplicate detection is lexical (shingling-style
  overlap), so it can miss a paraphrase that says the same thing in
  different words — the keep-both default is the deliberate mitigation, not
  a fix.

## Changing an agent

- Edit the agent's own file; keep this page a map, not a copy.
- Adding or renaming a skill: update `pr-self-review/references/routing.json`
  and the planner's "Lazy skill reading" table.
- Changing what `planner` produces means checking `implementer` (and
  `test-writer`, when a plan addresses a step to it) still consume it, and
  the reverse.
- Adding an agent: add it to the table above, the Flow, a per-agent section,
  and — if it writes code — the planner's Lazy-skill-reading table. If it
  writes into `docs/`, a new `docs/` subdirectory needs a row in
  `docs/README.md`, `doc-writer`'s only authority for where a page goes.
