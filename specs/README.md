# Specs

A spec defines **what** one feature must do and how to tell when it is done.
It is written before the plan and the code, and every later step is checked
against it. There is one spec per feature, even when the feature spans
several modules. The full rules live in
[`spec-creator`](../.claude/agents/spec-creator.md).

## Architecture

```
brief + design ──► spec-creator ──► specs/spec-NNNN-<slug>.md (draft)
                        ▲                         │
                        └── updates the draft ◄── ask the user: investigator? brainstorm?  (optional: WHAT to build)
                                                  │
                                            user approves
                                                  │
                         ask the user: investigator? brainstorm?  (optional: HOW to build; ACs are fixed)
                                                  │
                                                  ▼
                              implementation-planner ──► docs/plans/NNNN-<slug>.md
                                                  │
                                                  ▼
             implementer ──► architecture-reviewer ──► fixes ──► test-writer
                                                  │
                                                  ▼
                   plan-verifier (code + tests vs spec and plan)
                        │ not-met rows ──► implementer / test-writer ──► plan-verifier again (≤2 rounds)
                        ▼
             security-reviewer (required when untrusted text reaches an LLM or the page)
```

The spec and plan phases are run by hand. Everything from `implementer` on
runs automatically with `/run-sdd docs/plans/NNNN-<slug>.md`.

Before the spec phase, the user picks a profile: **full**, **lite** (no
investigator, brainstorm or architecture review) or **no spec**.

## Modules

Module tags on each AC and edge case say where it is implemented:

| Tag | Package |
|---|---|
| `client` | `@devdigest/web` |
| `server` | `@devdigest/api` |
| `repo-intel` | `server/src/modules/repo-intel` |
| `reviewer-core` | `@devdigest/reviewer-core` |
| `mcp` | `@devdigest/mcp` |

## Conventions

- File name: `specs/spec-NNNN-<slug>.md`: `spec-`, a 4-digit sequential
  number (the same scheme as `docs/plans/`), then a kebab-case slug saying
  what the spec is about, e.g. `spec-0001-blast-radius.md`. The folder is
  flat, and the numbers form one sequence for the whole repo. The
  `Spec ID` header line is `SPEC-0001`.
- Everything is written in English.
- Header lines: `Spec ID`, `Status` (`draft | approved | implemented`),
  `Supersedes`, `Modules` (the union of the AC tags, owner first), `Design`.
- Sections, in order: Problem and user · Goals / Non-goals · User stories ·
  Acceptance criteria (EARS) · Edge cases · Non-functional requirements ·
  Examples · Traceability and verification · Decisions · Inputs and provenance ·
  Untrusted inputs · Open questions.
- IDs: `AC-n`, `EC-n` (edge cases), `NFR-n`. Each ID has module tags, a
  priority (`must`, or `should`, which only the user may defer), and a row
  in *Traceability and verification* that gives its source (brief, design
  frame, user decision `D-n`, research, INSIGHTS entry) and a verification
  hint (the test level, or `manual` against a frame).
- Requirements use EARS with English triggers and `shall`:
  `- **AC-3** [server, client] must WHEN <trigger>, the PR page shall <response>.`
- *Examples* gives concrete Given / When / Then data for the riskiest
  requirements; tests use it as fixtures.
- How to write each part, with examples and a complete reference spec:
  [`.claude/skills/spec-writing/`](../.claude/skills/spec-writing/SKILL.md).
- Check a spec with
  `node .claude/skills/spec-writing/scripts/lint.mjs specs/spec-NNNN-<slug>.md`.
  It also runs automatically after every write by `spec-creator`.

## Hard rules

1. Only `spec-creator` writes here, and it never edits this README. A
   hook enforces this: it can write only spec files and
   `specs/images/spec-NNNN/*.png`.
2. A spec has no implementation details, such as files, steps or class
   names. The one exception is an external contract: a route, a payload
   field, an MCP tool name or an SSE event.
3. Every AC can be tested and has at least one module tag. An AC with two
   or more tags names the contract between those modules.
4. `approved` and `implemented` are set only on the user's explicit word.
   Planning starts from an `approved` spec.
5. Every open gap is marked `[NEEDS CLARIFICATION]`, never assumed.
6. Specs are never renumbered, and a spec is never edited to match the
   code. A change gets a new spec with `Supersedes:`, and the old spec gets
   only one added line: `Superseded by: SPEC-NNNN`.
7. An AC is done only when its behaviour is in the code of every module it
   is tagged with, **and** a test exercises it. The only exception is an
   AC no test can reach, such as a visual layout. The verifier marks it
   `met-manual`, and it counts as done only when the user accepts it
   against the saved design frame.
8. Design frames are saved to `specs/images/spec-NNNN/`, and the spec's
   `Design:` line lists them. A Figma link alone is not enough, because
   other agents cannot open it.
9. A spec must pass the lint before it can be approved.
10. Other material goes elsewhere: plans → `docs/plans/`, docs for built
   code → `docs/specs/`, decisions → `docs/decisions/`, older module notes
   → `<module>/specs/`, e2e flows → `e2e/specs/`.
