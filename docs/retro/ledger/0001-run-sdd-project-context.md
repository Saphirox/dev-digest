# Retro 0001 — spec → plan → /run-sdd: Project Context

**Date:** 2026-10-03 · **Session:** `7ec951bc-b380-49de-bcdd-eb2a31765e14` · **Window:** whole session (2026-09-29 09:02 → 2026-10-03; the user asked to "estimate session", so the window is wider than the skill's `cmd:run-sdd` default) ·
**Mode:** default · **Plan:** `docs/plans/0014-project-context.md` · **Spec:** `specs/spec-0001-project-context.md`

## Summary

One feature — attach repository markdown docs to agents and skills, inject them as untrusted prompt blocks — went from a Ukrainian brief plus four design frames to 103 committed files (`102e674`) with 39/42 `must` spec items met and 3 left for the user's eye, at a cost of 80.7M tokens across 25 agents, two of which died and one of which hit a turn limit.

## Numbers

| Metric | Value |
|---|---|
| Tokens — total / main / agents | 80.74M / 28.73M / 52.01M |
| Output tokens (agents: lower bound) | 189.1k total (main 107.0k) |
| Agents spawned (by type) | 25 — implementer 7, brainstorm 3, investigator 3, architecture-reviewer 3, spec-creator 2, test-writer 2, plan-verifier 2, security-reviewer 2, implementation-planner 1 |
| Waves / max parallel | 15 spawn groups / max 2 concurrent (6 parallel pairs) |
| Wall time / active time | 5764.8 min (96.1 h) / 767.2 min (12.8 h). `/run-sdd` sub-window: 47.32M tokens, 16 agents, 96 min active |
| User prompts / stop-and-ask questions / user corrections | 47 / 12 `AskUserQuestion` calls (~32 questions) / 6 |
| Tool calls / errors / blocked | 753 (main 104, agents 649) / 79 / 44 |
| Architecture rounds / verify fix rounds / security fix round | 2 (+1 verify-loop check) / 1 fix round, 2 verifier runs / 1 fix round (+1 re-check) |
| Spec compliance (`must`, `should`, `met-manual`) | 39/42 `must`, 0/0 `should`, 3 `met-manual` — from plan-verifier `a74faf2`; **not re-run after the security fix round** changed server code again |
| Cache-hit ratio (main) / compactions | 0.96 / 0 |

Measurement caveats: agent durations for resumed agents include the idle gap between a stall and the resume (`a49117f` 658 min, `a9928fa` 541 min are wall span, not work); subagent output tokens are a lower bound (stats script note).

## Timeline

| # | Wave | Agent | Task | Model | Min | Tokens | Outcome |
|---|---|---|---|---|---|---|---|
| 1 | 1 | spec-creator `aa56a93` | Write Project Context spec | opus-5-5 | 2.6 | 1.53M | **killed** — hook denied every screenshot copy |
| 2 | 2 | spec-creator `a49117f` | Write Project Context spec | opus-5-5 | 658.1* | 3.20M | completed — draft + 16 open questions; later resumed twice |
| 3 | 2 | brainstorm `a18b612` | Q4/Q5/Q8 options | opus-5-5 | 121 | 2.05M | **failed** — stream watchdog, no report |
| 4 | 2 | brainstorm `a8c8f0d` | Retry Q4/Q5/Q8 | opus-5-5 | 1.5 | 180.4k | completed — 4 options each |
| 5 | 2 | investigator `a7d880e` | Clone state during review | sonnet-5-5 | 2.0 | 851.1k | completed — settled Q7 |
| 6 | 2 | investigator `ae75ed0` | CI review prompt path | sonnet-5-5 | 2.0 | 699.0k | completed — CI → non-goal |
| 7 | 2 | investigator `aa3e9ce` | Map code touched by spec-0001 | sonnet-5-5 | 8.9 | 7.51M | completed — 36k-char brief, 13 traps |
| 8 | 2 | brainstorm `ad25f45` | How to build spec-0001 | opus-5-5 | 2.6 | 781.6k | completed — 4 build questions |
| 9 | 3 | implementation-planner `a65b113` | Plan spec-0001 | opus-5-5 | 11.1 | 10.55M | completed **after resume** — hit 60-turn limit with no output |
| 10 | 4 | implementer `a8e8cac` | W1 shared contracts | sonnet-5-5 | 1.1 | 303.8k | completed clean |
| 11 | 4 | implementer `aaeaef6` | W1 reviewer-core prompt | sonnet-5-5 | 1.9 | 511.2k | completed clean |
| 12 | 5 | implementer `ab0a1dc` | W2 server steps 4–10 | sonnet-5-5 | 8.6 | 6.86M | completed clean |
| 13 | 5 | implementer `a5cc955` | W2 client steps 11–16 | sonnet-5-5 | 7.3 | 5.60M | completed clean |
| 14 | 6 | architecture-reviewer `a3a3683` | Arch round 1 | opus-5-5 | 4.0 | 1.94M | 0 critical, 2 warning, 4 suggestion |
| 15 | 7 | implementer `a864666` | Fix AR-1-1/2 | sonnet-5-5 | 1.4 | 354.1k | completed clean |
| 16 | 8 | architecture-reviewer `afb47ff` | Arch round 2 | opus-5-5 | 1.2 | 252.8k | both closed, 0 new |
| 17 | 9 | test-writer `a9928fa` | Per-AC tests | sonnet-5-5 | 540.7* | 522.2k | **stalled 600 s**, resumed, then completed |
| 18 | 10 | plan-verifier `ab92684` | Verify round 1 | opus-5-5 | 5.3 | 2.50M | 35/42 must; 1 code + 4 test fix rows |
| 19 | 11 | implementer `a9a89ff` | Fix AC-24 | sonnet-5-5 | 0.5 | 171.1k | completed clean |
| 20 | 11 | test-writer `ac447c2` | Fix 4 test rows | sonnet-5-5 | 1.0 | 273.2k | completed clean |
| 21 | 12 | architecture-reviewer `a1c416b` | Arch check on AC-24 fix | opus-5-5 | 0.5 | 74.3k | 0 critical/warning |
| 22 | 12 | plan-verifier `a74faf2` | Verify round 2 | opus-5-5 | 4.1 | 1.48M | 39/42 must, fix list empty |
| 23 | 13 | security-reviewer `ae6d76e` | Security review | opus-5-5 | 4.1 | 1.61M | **2 HIGH**, 2 MEDIUM, 4 LOW |
| 24 | 14 | implementer `a74653b` | Fix SEC-1/SEC-2 | sonnet-5-5 | 2.8 | 774.9k | completed clean |
| 25 | 15 | security-reviewer `ac0aa31` | Re-check fixes | opus-5-5 | 2.1 | 328.7k | both closed, 1 new MEDIUM |

\* wall span including a resume gap, not work time.

## Per agent

### 1–2. spec-creator `aa56a93` (killed), `a49117f` — write the spec

- **Difficulties:** `aa56a93` was killed by the user after the scope hook denied every `cp` of a user-attached screenshot (5 errors, 4 blocked): `spec-creator-scope.mjs` matched `cp` sources with `\S+`, and the attachment path contains a space. `a49117f` could not call `AskUserQuestion` (background agent), so all 16 gaps became `[NEEDS CLARIFICATION]`; it later refused to set `Status: approved` from a relayed approval, and the orchestrator edited the line.
- **Went easily:** read all four frames, saved them to `specs/images/spec-0001/`, produced 26 AC / 9 EC / 7 NFR, lint clean on the first run; translated two Ukrainian briefs faithfully.
- **Duplicated:** re-listed `specs/` and re-read module `AGENTS.md`/`INSIGHTS.md` on each of its three invocations (report, both resumes).
- **Missed:** wrote an NFR-6 *Example* (12,000-token doc `included`) that contradicts its own NFR-5 8,000-token per-doc cap — caught by the implementer at build time, still unfixed in the spec. Wrote NFR-1 as an outer boundary only ("never outside the clone"), which the SEC-1 symlink leak satisfies.
- **Handoff:** prompt carried both briefs verbatim and absolute image paths — that worked. Report (6.9k chars) listed every open question with a proposed default, which made the relay cheap.

### 3–4. brainstorm `a18b612` (failed), `a8c8f0d` — Q4/Q5/Q8

- **Difficulties:** `a18b612` burned 2.05M tokens and 121 min, then died to the stream watchdog with no report — the single largest piece of pure waste in the run. 7 errors (3 blocked). The retry with an explicit "~10 tool calls, be brisk" budget finished in 1.5 min on 180.4k tokens.
- **Went easily:** the retry produced 4 materially distinct options per question with repo-grounded cost estimates.
- **Duplicated:** the retry re-read the spec and `prompt.ts` that `a18b612` had already read.
- **Missed:** —
- **Handoff:** report (14.1k chars) ended in a "Pick one" block that mapped 1:1 onto an `AskUserQuestion` call; the user picked all three recommendations.

### 5–7. investigator `a7d880e`, `ae75ed0`, `aa3e9ce`

- **Difficulties:** no working search tool. `rg` fails through the rtk wrapper, `grep` is not in `readonly-allowlist.mjs`; between them 24 errors, 16 blocked. Every report ends with a "Could not establish" section naming the search it could not run (`a7d880e`: callers of `fetchPullHead`; `ae75ed0`: other `assemblePrompt` callers; `aa3e9ce`: the whole call graph).
- **Went easily:** `a7d880e` and `ae75ed0` each settled their question in 2 min on <1M tokens — the best value per token in the run. `aa3e9ce`'s 13-trap list (422/400 mismatch, `clone_path` ambiguity, `sanitizeDocRef` unexported, skills `.set` spread) was used almost verbatim by the planner and implementers.
- **Duplicated:** `aa3e9ce` (7.51M) re-read `run-executor.ts`, `prompt.ts` and the contracts that `ae75ed0` had just read.
- **Missed:** the `.git/config` symlink reachability — it flagged the symlink risk at the boundary (quoting the 2026-09-20 insight) but not that realpath containment still admits `.git` *inside* the clone.
- **Handoff:** `aa3e9ce`'s 36k-char report is the largest in the run; the planner then re-walked much of the same ground anyway (see below).

### 8. brainstorm `ad25f45` — how to build

- **Difficulties:** read the spec while it still said `Status: draft` and flagged the inconsistency; 3 errors (2 blocked).
- **Went easily:** 2.6 min, 781.6k tokens, four build questions with a clear recommendation each — all four picks were its recommendations.
- **Duplicated / Missed:** —
- **Handoff:** clean "Pick one per question" ending.

### 9. implementation-planner `a65b113` — the plan

- **Difficulties:** the most expensive agent in the run (10.55M, 13% of all tokens). Hit its 60-turn limit still reading files, with no report written; needed a resume telling it to stop exploring and deliver. 10 errors, 6 blocked (same `rg`/`grep` hole). Left 6 items "(unverified — implementer checks)".
- **Went easily:** after the resume it produced a 16-step plan with a traceability table that every later agent used unchanged; the work split held with no file collisions.
- **Duplicated:** this is the run's clearest duplication — it re-read `run-executor.ts`, `prompt.ts`, the agents/skills modules and the contracts that `aa3e9ce` had just mapped and that its own prompt summarised. ~18M tokens went into investigator + planner covering largely the same files.
- **Missed:** planned `SpecFile.type`/`tokens` as nullish where AC-1 needs them on every entry (the implementer deviated, correctly); named a test file (`project-context.it.test.ts`) that was never created under that name.
- **Handoff:** the plan file is the single best artefact of the run — later agents needed only its path plus a decisions list.

### 10–13, 15, 19, 24. implementer ×7

- **Difficulties:** essentially none — 7 agents, 2 tool errors between them, 0 blocked. The only friction was `pnpm` scripts failing with `ERR_PNPM_IGNORED_BUILDS`, worked around by calling binaries directly (a known INSIGHTS entry they each rediscovered). `a5cc955` created a stray `client/pnpm-workspace.yaml` and deleted it.
- **Went easily:** every one finished first time with its suites green. The two wave-2 implementers (6.86M + 5.60M) built 90+ files in parallel with no collision.
- **Duplicated:** each re-read the plan from disk although its prompt already summarised the relevant steps; each re-read module `INSIGHTS.md`.
- **Missed:** `ab0a1dc` wrote `specs_read` to include `missing` paths (AC-24 fail, caught by plan-verifier) and shipped the symlink-reachable `read()` (SEC-1, caught by security-reviewer). Both were spec-wording gaps as much as implementation gaps.
- **Handoff:** reports were short (3–8.6k chars) and correctly listed deviations — the AC-1 contract deviation was flagged by `a8e8cac` and survived review because it was visible.

### 14, 16, 21. architecture-reviewer ×3

- **Difficulties:** 7 errors, 4 blocked (search again); could not enumerate `new SkillsService(` call sites and said so.
- **Went easily:** round 1 found both real duplications (AR-1-1 shared error class, AR-1-2 missing mock) in 4 min; round 2 confirmed closure in 1.2 min on 252.8k tokens — cheap confirmation.
- **Duplicated:** re-ran `pnpm arch:check` in all three rounds (the orchestrator already had the baseline).
- **Missed:** nothing that a later gate caught in its domain. It explicitly disclaimed security.
- **Handoff:** findings carried `path:line`, rule and failure scenario, which made the fix prompt a copy-paste.

### 17, 20. test-writer ×2

- **Difficulties:** `a9928fa` stalled for 600 s immediately after announcing "Now apply edits." and had to be resumed; its resume then needed "re-read files before editing, you may have partially written some".
- **Went easily:** `ac447c2` turned four verifier rows into four tests in 1 min; found that the AC-24 code fix had already landed and the assertions passed first try.
- **Duplicated:** `a9928fa` re-inventoried tests the implementers had already listed in their reports.
- **Missed:** `a9928fa` left AC-10 (drag), AC-22 (guard) and AC-26 (copy/expand) untested and classed AC-10 as manual-only; the verifier disagreed, correctly, since jsdom can dispatch drag events.
- **Handoff:** its ID→test table was the input the verifier needed.

### 18, 22. plan-verifier ×2

- **Difficulties:** 3 errors, 3 blocked; could not grep for call sites.
- **Went easily:** the most valuable gate per token in the run — round 1 caught a real code bug (AC-24) plus three missing tests that four earlier agents had passed over, in 5.3 min.
- **Duplicated:** re-ran every suite the implementers had just run (arguably the point, but ~4M tokens across two rounds).
- **Missed:** did not re-run after the security fix round, so the final 39/42 figure predates the last server change (orchestrator's call, not the agent's).
- **Handoff:** verdict table with per-ID evidence and a fix list split into code rows vs test rows — this is what let the fix round run two agents in parallel.

### 23, 25. security-reviewer ×2

- **Difficulties:** 8 errors, 4 blocked; could not time the tokenizer (no interpreter on its allowlist), so SEC-9 stayed unverified — and the orchestrator's own timing probe was then blocked twice by an unavailable permission classifier.
- **Went easily:** found the critical finding of the run — an in-clone symlink to `.git/config` sends the GitHub token to the LLM, the DB and the trace UI — that spec, plan, two architecture rounds and two verifier rounds had all passed.
- **Duplicated:** re-read `prompt.ts`, `fs.ts` and the contracts.
- **Missed:** nothing found later.
- **Handoff:** findings included the exploit chain and a concrete fix, so the fix implementer needed no further context.

## Workflow signals

- **Blocked tool calls — 44 of 79 errors (56%).** One root cause: read-only agents have no working search. `readonly-allowlist.mjs` FILES allows `rg` but not `grep`, and `rg` itself fails through the rtk wrapper. Every read-only agent (investigator, brainstorm, planner, both reviewers, verifier) shipped a "Could not establish" section because of it, and the planner's 6 "(unverified)" items went straight into the plan.
- **Stop-and-ask — 12 calls, ~32 questions, all necessary but mostly avoidable in form.** Background agents cannot call `AskUserQuestion`, so spec-creator, brainstorm and the planner all degraded to "here are my defaults / pick one" and the orchestrator relayed. One question was genuinely my fault (the user replied "I didnt get it" to a research question written in agent jargon).
- **Stuck or silent agents — 3 of 25.** `a18b612` failed after 121 min and 2.05M tokens with no output; `a9928fa` stalled 600 s mid-task; `a65b113` hit its 60-turn limit with nothing written. All three were recovered by a resume or a retry with a tighter budget — the retry of the failed brainstorm cost 11× less than the original.
- **Loop rounds — 2 architecture, 1 verify fix round, 1 security fix round.** Each loop closed on its first fix attempt with 0 bounce-backs; no finding marked `fixed` ever came back. The loops worked.
- **Rework — 10 of ~100 files touched twice** (6 by the AC-24/test round, 10 by the security round, overlapping). Low.
- **User interventions — 6.** Hook fix for screenshot copying (user stopped the agent); a denied `git status`; an unclear question; `/run-sdd` had to be typed by the user because `disable-model-invocation` blocks the Skill tool; a 500 from another worktree's dev server; "even my repo does not work" (no clone in this worktree) and then a confusing answer from me about the "synced" badge.
- **Parallelism — max 2 concurrent, 6 pairs.** Wave 2 (server ∥ client implementers, 8.6 and 7.3 min) and the fix rounds parallelised well. The critical path was serial by necessity: spec → plan → build → review → verify → security.
- **Token split — agents 64%, main 36%.** Three contexts are 31% of the whole run: planner 10.55M, investigator `aa3e9ce` 7.51M, server implementer 6.86M. The two cheapest investigators (851k, 699k) each settled a decision the spec depended on.
- **Cache — 0.96 main, 0 compactions.** No context pressure; the long tail of agent re-reads was cheap per token but not free.
- **Spec compliance — 39/42 `must` + 3 `met-manual`,** and the three manual ones were exactly where the user later found a real usability hole (no way to clone from the "Repository not cloned" state).

## Comparison with earlier retros

First entry in the ledger — no prior run to compare against. Baselines recorded here for the next retro: **80.7M tokens, 25 agents, 2 arch rounds, 1 verify fix round, 1 security fix round, 44 blocked calls, 39/42 must.**

One proposal-shaped change landed between this run and the retro, from another session: commit `64699d4` (2026-10-02) dropped `maxTurns` from every agent, which addresses the `a65b113` turn-limit stall directly. No proposal is filed for it.

## Module insights

Candidate `INSIGHTS.md` lines — not written there; the user promotes them.

### client

- 2026-10-03 · The repo switcher's "synced" badge is `last_polled_at ? "synced" : "not synced"` (`client/src/components/app-shell/helpers.ts:12`) — it means DevDigest polled GitHub's PR API, NOT that a clone exists on disk. A repo reads "main · synced" in the sidebar while every clone-backed page (Project Context, diff fallback) correctly says "Repository not cloned". Two true statements that look contradictory; check `GET /repos/:id/context` → `cloned` before believing the badge.

### server

- 2026-10-03 · `DEVDIGEST_CLONE_DIR=./clones` is per-worktree (`server/.env:32`) but `repos.clone_path` lives in the SHARED dev DB: a repo cloned in worktree A stores an absolute path into A, so worktree B reads "not cloned" and re-clones into its own `server/clones/`. Extends the 2026-09-21 deleted-worktree entry — the path can point at a LIVE other worktree, not only a deleted one. Fix for a fresh worktree: `POST /repos/:id/refresh`, which re-runs the clone job locally.
- 2026-10-03 · A byte cap is not a CPU cap for a BPE tokenizer: `MAX_DOC_BYTES` bounds memory and read time but js-tiktoken's merge loop is roughly quadratic in the length of a whitespace-free chunk, so 1 MB of one repeated character can still block the event loop in `ProjectContextService.list`. Bound what reaches the tokenizer in characters or chunk length too, or fall back to `approxTokens` above ~64 KB. (Unverified — `security-reviewer ac0aa31`; two timing probes were blocked by an unavailable permission classifier.)

### root

- 2026-10-03 · An NFR phrased only as an outer boundary can be fully met while leaking from inside it: spec-0001 NFR-1 said "never read a file whose realpath escapes the clone", and `.git/config` — which holds the GitHub token in the clone URL — is *inside* the clone. The spec, the plan, two architecture rounds and two verifier rounds all passed the symlink read; only `security-reviewer` caught it. For any NFR about file, path or network access, state what is forbidden INSIDE the boundary as well.

Already recorded, not repeated: background agents lacking `AskUserQuestion` and the `rg`/`grep` hole (root `INSIGHTS.md:78-79`), in-clone symlinks defeating realpath containment (`server/INSIGHTS.md:84`), the `ProjectDoc` prompt change (`reviewer-core/INSIGHTS.md:20`).

## Proposals

| ID | Target | Change | Evidence | Expected effect | Priority | Status |
|---|---|---|---|---|---|---|
| P-0001-1 | `.claude/hooks/readonly-allowlist.mjs`, `FILES` array (line ~23) | Add `r(/^grep\b/, (s) => !/\s-f\b/.test(s), '`grep -f` reads a pattern file')` next to the existing `rg` rule, and update the Bash table in each read-only agent's `.md` to list `grep`. `grep` cannot write files, so it is as safe as the `rg` already allowed. | 44 of 79 tool errors were blocks; `aa3e9ce` 7, `a65b113` 6, `ae75ed0` 5, `a7d880e` 4 blocked; every read-only report has a "Could not establish" naming the search it could not run, and 6 of the planner's claims entered the plan as "(unverified)" | Blocked calls → near 0; fewer unverified claims reaching the implementer | high | open |
| P-0001-2 | `.claude/skills/run-sdd/SKILL.md` (new step before planning) + `.claude/agents/implementation-planner.md` *Inputs* | The caller saves each investigator/brainstorm report to `docs/plans/NNNN-<slug>.research.md` and passes that path; the planner's Inputs say "read it first and do not re-open a file it already cites with `path:line` unless you need a line it did not quote". | investigator `aa3e9ce` 7.51M then planner `a65b113` 10.55M re-walking the same files; the planner hit its turn limit still reading and produced no report until resumed; its prompt already summarised the brief, which it re-derived anyway | Planner tokens down (target <5M); fewer turn-limit stalls | high | open |
| P-0001-3 | `.claude/skills/spec-writing/SKILL.md`, NFR section | For any NFR constraining file, path, process or network access, require a second clause naming what stays forbidden *inside* the allowed boundary (credentials, `.git`, dot-dirs, other tenants' rows), with an EC for it. | NFR-1 "never outside the clone" was met by code that read `.git/config` via an in-clone symlink and sent the GitHub token to the LLM, the DB and the UI (SEC-1); spec + plan + 2 arch rounds + 2 verify rounds all passed it | HIGH security findings move from step 5 of 7 to the spec; fewer late fix rounds | high | open |
| P-0001-4 | `.claude/agents/README.md` *Permissions* table + `.claude/agents/spec-creator.md` lifecycle rule | (a) State that an agent spawned via the Agent tool runs in the background where `AskUserQuestion` is unavailable, and that such agents must end with a numbered `## Questions` block for the caller to relay — the README's permission column currently promises `AskUserQuestion` to five agents that cannot use it. (b) Let `spec-creator` accept an approval relayed by the caller when it quotes the user's words, instead of refusing and forcing the caller to hand-edit `Status:`. | `a49117f` turned 16 gaps into `[NEEDS CLARIFICATION]` and refused the relayed approval; the orchestrator edited the status line itself; 12 relay rounds for ~32 questions | Fewer relay round-trips; no hand-edited lifecycle lines | medium | open |
| P-0001-5 | `.claude/skills/run-sdd/SKILL.md`, step 7 *Final report* | For every `met-manual` AC, the final report must give the exact URL or command that shows it, and the report must end with a cold-start check: "from a fresh worktree, can the user reach this feature?" | The run ended green while `/repos/:id/context` showed "Repository not cloned" with no clone action anywhere in the UI; the user hit a 500 from another worktree's dev server; 3 ACs were `met-manual` and that is exactly where the hole was | User-found gaps after a green run → down | medium | open |
| P-0001-6 | `.claude/skills/workflow-retro/scripts/session-stats.mjs` | Mark agents that were resumed via `SendMessage` and report their active span separately from wall span. | `a49117f` shows 658 min and `a9928fa` 541 min, both dominated by idle time between a stall and the resume; as printed they look like the two slowest agents in the run | Timeline durations become comparable | low | open |

Nothing was staged or committed by this retro.
