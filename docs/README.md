# Docs

Routing index for everything under `docs/`. `doc-writer`
([`.claude/agents/doc-writer.md`](../.claude/agents/doc-writer.md)) reads this
file to pick a destination by content type — Diátaxis
(https://www.diataxis.fr/) names the type, not the folder; the folder is this
repo's own mapping onto it. When a change adds a new `docs/` subdirectory or
changes what belongs where, update this table.

## Where a piece of writing goes

| Content type (Diátaxis) | Destination | Naming | Example |
|---|---|---|---|
| Reference/how-to for a reviewer system prompt | `docs/agent-prompts/<name>.md` — plus the mandatory push to `PUT /agents/:id` once the prompt file changes (the DB is the source of truth at run time) | `<agent-name>.md`, one file per reviewer agent | [`docs/agent-prompts/general-reviewer.md`](agent-prompts/general-reviewer.md); the push rule is at [`docs/agent-prompts/README.md`](agent-prompts/README.md) (`How a prompt is assembled` / the `PUT /agents/:id` line) |
| Feature explanation + reference | `docs/specs/<feature>.md` | `<feature-kebab-name>.md` | [`docs/specs/conventions.md`](specs/conventions.md) |
| Dated investigation with a `Status:` line | `docs/research/<topic>.md` | `<topic-kebab-name>.md`, starts with a `Status: … · Date: … · Scope: …` line | [`docs/research/rebase-before-commit-hook.md`](research/rebase-before-commit-hook.md) |
| Development Plan for a change that is about to be built | `docs/plans/NNNN-<slug>.md` | 4-digit sequential prefix + kebab slug | [`docs/plans/0001-helper-agent-set.md`](plans/0001-helper-agent-set.md) |
| Reproducible experiment + kit | `docs/experiments/<name>.md` (the write-up) + `docs/experiments/<name>/` (patches, fixtures, anything the experiment replays) | `<name>.md` / `<name>/` share a stem | [`docs/experiments/skills-control.md`](experiments/skills-control.md) + `docs/experiments/skills-control/` |
| Sample skill artifacts for the import flow (NOT documentation *about* skills — that is [`.claude/skills/README.md`](../.claude/skills/README.md)) | `docs/skills/` | whatever the sample skill needs to look like (a `SKILL.md`-bearing `.md`, a `.zip`, a helper script) | [`docs/skills/README.md`](skills/README.md) |
| Decision with rejected alternatives | `docs/decisions/NNNN-<slug>.md`, MADR/Nygard shape (context, decision, rejected alternatives with why) | 4-digit sequential prefix + kebab slug | `docs/decisions/0001-<slug>.md` — **created lazily on first use**; the directory does not exist yet, do not create an empty one now |
| Committed screenshots | `docs/images/<area>/` | `<area>/` groups screenshots by the feature or page they show; filenames free | `docs/images/<area>/` — convention only, recorded at root [`INSIGHTS.md`](../INSIGHTS.md) (2026-09-19, capturing images to commit); the directory does not exist in this tree yet |

## Plans — the rule

**Every Development Plan is written to `docs/plans/NNNN-<slug>.md` before any
code is written against it.** Not to a scratch file, not to a chat message
that scrolls away: the plan is the contract between `planner` and
`implementer`, and `plan-verifier` checks the finished code against it item by
item. All three need one stable path to point at.

- **Who writes it:** the caller, not `planner` — `planner` is read-only and has
  no `Write`. It returns the plan; whoever invoked it saves it here and hands
  `implementer` the path.
- **The number** is the next unused 4-digit prefix in `docs/plans/`, never
  renumbered afterwards — same convention as `docs/decisions/` and the
  migrations.
- **A plan is not edited to match what was built.** Deviations are recorded by
  `implementer` in its report and verified as `deviation-recorded`; the plan
  keeps saying what was intended. Re-planning writes a new numbered file that
  names the one it supersedes.
- **A plan is not a spec and not a decision record.** What the feature *is*
  goes to `docs/specs/`; *why this approach over the alternatives* goes to
  `docs/decisions/`. A plan is the ordered work: steps, files, verification.

## Does NOT belong in `docs/`

| What | Goes in |
|---|---|
| Module or repo rules an agent must follow | `AGENTS.md` (root or module) |
| A lesson learned — gotcha, root cause, dead end, tool quirk | `INSIGHTS.md` (root or module), owned by the `engineering-insights` skill |
| Suite/CI strategy | [`TESTING.md`](../TESTING.md) |
| Module-internal notes | `<module>/README.md` (e.g. [`server/README.md`](../server/README.md)) |

## Adding a new subdirectory

Add a row above before writing into it. `doc-writer` has no other source for
"where does this go" — an undocumented destination is a reason for it to stop
and ask rather than guess.
