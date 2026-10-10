# Retro 0003 — run-sdd: Multi-Agent Review

**Date:** 2026-10-10 · **Session:** `1440b777-f58c-4626-bb79-8c946956a010` · **Window:** `cmd:run-sdd` (13:22:49Z) → end ·
**Mode:** default · **Plan:** `docs/plans/0018-multi-agent-review.md` · **Spec:** `specs/spec-0004-multi-agent-review.md`

## Summary

`/run-sdd` built Multi-Agent Review across server, client, mcp and e2e. It meets every spec `must` item (61 of 61, 0 `met-manual`) and every plan item, and left 2 MEDIUM security findings for the user. It cost 49.24M tokens (stats) and 64.6 min of wall time.

## Numbers

| Metric | Value |
|---|---|
| Tokens — total / main / agents | 49.24M / 20.01M / 29.23M (stats) |
| Output tokens (agents: lower bound) | 49.8k total; main 37.7k (stats) |
| Agents spawned (by type) | 12: implementer 4, architecture-reviewer 3, test-writer 2, plan-verifier 2, security-reviewer 1 (stats) |
| Waves / max parallel | 10 waves / 2 parallel. Wave 2 ran server + client; wave 10 ran plan-verifier + security-reviewer (stats) |
| Wall time / active time | 64.6 min / 51.7 min (stats) |
| User prompts / stop-and-ask questions / user corrections | 18 prompts in the window, which includes the post-run DB question and this retro (stats). 1 stop-and-ask (Docker down; context). 0 corrections during the run (context) |
| Tool calls / errors / blocked | main 49 calls / 2 errors; agents 347 calls / 28 errors, 16 of them blocked (stats) |
| Architecture rounds / verify fix rounds / security fix round | 3 (one of them wasted, see signals) / 1 / 0 (state) |
| Spec compliance (`must`, `should`, `met-manual`) | 61/61, 0/0, 0 (plan-verifier `a77eaf8` report). The e2e plan item was `cannot-verify` for the verifier and was settled by the orchestrator's own `e2e:hermetic` run, 12/12 (state log) |
| Cache-hit ratio (main) / compactions | 0.99 / 0 (stats) |

## Timeline

| # | Wave | Agent | Task | Model | Min | Tokens | Outcome |
|---|---|---|---|---|---|---|---|
| 1 | 1 | implementer `ad25f00` | contracts (step 1) | sonnet-5-5 | 1.2 | 379.4k | done; 4 expected tsc errors handed to step 6 |
| 2 | 2 | implementer `af2d859` | server + mcp (steps 2–9) | sonnet-5-5 | 7.9 | 6.23M | done; 668 server / 156 mcp tests, 0 skipped |
| 3 | 2 | implementer `af2305f` | client (steps 10–17) | sonnet-5-5 | 12.1 | 10.57M | done; 424 client tests |
| 4 | 3 | architecture-reviewer `af1127f` | round 1 | opus-5-5 | 3.0 | 1.19M | 0 critical, 2 warning, 1 suggestion |
| 5 | 4 | implementer `a443c68` | fix AR-1-1/2 | sonnet-5-5 | 0.6 | 128.4k | done |
| 6 | 5 | architecture-reviewer `a3fc654` | round 2 | opus-5-5 | 0.6 | 88.5k | "not closed": it saw a partly staged index |
| 7 | 6 | architecture-reviewer `a5ff128` | round 3 | opus-5-5 | 0.6 | 72.8k | both findings closed |
| 8 | 7 | test-writer `af0fc74` | tests + e2e flows 11/12 | sonnet-5-5 | 9.0 | 2.46M | done; e2e 12/12 |
| 9 | 8 | plan-verifier `a8fbc9b` | verify round 1 | opus-5-5 | 7.9 | 5.71M | 58/61; 3 test gaps plus a gap in flow 12 |
| 10 | 9 | test-writer `afb1623` | close the fix list | sonnet-5-5 | 2.1 | 564.0k | done |
| 11 | 10 | plan-verifier `a77eaf8` | verify round 2 | opus-5-5 | 2.0 | 751.9k | 61/61; e2e `cannot-verify` (hook) |
| 12 | 10 | security-reviewer `aeca3a2` | security | opus-5-5 | 2.5 | 1.09M | 0 HIGH, 2 MEDIUM, 3 LOW |

## Per agent

### 1. implementer `ad25f00` — contracts

- **Difficulties:** `pnpm typecheck` died on `ERR_PNPM_IGNORED_BUILDS` and left a stray `server/pnpm-workspace.yaml`. It deleted that file and fell back to `tsc` (report).
- **Went easily:** both vendored copies came out identical, 12/12 contract tests, done in 1.2 min (report, stats).
- **Duplicated:** —
- **Missed:** — (the 4 tsc errors were expected and handed on).
- **Handoff:** good. It named the exact `routes.ts:53-54` errors for step 6.

### 2. implementer `af2d859` — server + mcp

- **Difficulties:** none reported. 51 tool calls and 0 errors (stats).
- **Went easily:** it found 5 more legacy payloads than the plan listed and migrated them. It also cleared the plan's `RunLogger` concurrency risk by reading the code (report).
- **Duplicated:** —
- **Missed:** — (no review finding on server code). It did not try a second apply of migration 0020 (report, *Not verified*).
- **Handoff:** good. Every deviation was listed: workspace-scoped `reviewsForRuns`, 422→400 test change, local return type.

### 3. implementer `af2305f` — client

- **Difficulties:** none reported. It was the longest agent (12.1 min, 10.57M tokens) and the critical path of wave 2 (stats).
- **Went easily:** a clean move of `FindingCard`/`RunTraceDrawer`, and it kept the e2e-relevant texts it was asked to keep (report).
- **Duplicated:** —
- **Missed:** AR-1-1 (it copied the severity rank instead of importing it) and AR-1-2 (an English severity label outside i18n) (state). Three AC tests were too weak (AC-20/28/29, plan-verifier `a8fbc9b`).
- **Handoff:** the report was 9.8k chars and useful; test-writer reused its notes on roles and texts.

### 4. architecture-reviewer `af1127f` — round 1

- **Difficulties:** 5 errors, 1 blocked. `rg` fails under rtk, and `pnpm arch:check` hit `ERR_PNPM_IGNORED_BUILDS`, which recreated `server/pnpm-workspace.yaml` (stats, report, context).
- **Went easily:** a full 117-file review in 3 min, with depcruise reused (report).
- **Duplicated:** it re-ran depcruise, which the server implementer had already run and reported (inference from both reports).
- **Missed:** —
- **Handoff:** good. Each finding had a rule, a falsifier and a fix.

### 5. implementer `a443c68` — fix AR-1-1/2

- **Difficulties:** —
- **Went easily:** done in 0.6 min, 426 client tests (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** fine.

### 6. architecture-reviewer `a3fc654` — round 2

- **Difficulties:** it reviewed an index the orchestrator had only partly staged. The orchestrator's `git add -- $F` did not word-split in zsh, so the stage failed, and the reviewer was already spawned in the same message (context). 1 blocked call (`rtk proxy git status`) (stats).
- **Went easily:** it correctly spotted `AM` status and said what to stage (report).
- **Duplicated:** the whole round was wasted. Round 3 repeated it.
- **Missed:** —
- **Handoff:** good diagnosis.

### 7. architecture-reviewer `a5ff128` — round 3

- **Difficulties:** —
- **Went easily:** confirmed both fixes in 0.6 min (report).
- **Duplicated:** re-did round 2's work.
- **Missed:** —
- **Handoff:** fine.

### 8. test-writer `af0fc74` — tests + e2e

- **Difficulties:** plain `npm run e2e:hermetic` fails at `pnpm db:migrate`. It found the `pnpm_config_verify_deps_before_run=false` workaround (report).
- **Went easily:** it wrote 2 new e2e flows and ran 12/12 on the first full run, in the first run of the new e2e rules (report).
- **Duplicated:** it built an ID→test map, and plan-verifier re-derived it from scratch, as its prompt tells it to (reports).
- **Missed:** it claimed "every ID has a test", but plan-verifier then found AC-20/28/29 not exercised and flow 12 missing 2 planned checks (plan-verifier `a8fbc9b`). Composite titles such as "AC-28/29/31" hid half-covered IDs.
- **Handoff:** it raised a possible AC-31 gap, and the verifier showed it was not real (reports).

### 9. plan-verifier `a8fbc9b` — verify round 1

- **Difficulties:** 10 errors, 8 blocked: `rg` broken, `npm run e2e:hermetic` denied by the verify hook profile, `grep` not allowlisted (stats, report).
- **Went easily:** a thorough 61+63-row table; it resolved the AC-31 question with code evidence (report).
- **Duplicated:** it re-ran every suite the implementers and test-writer had just run (its role; inference).
- **Missed:** —
- **Handoff:** the report was 25.5k chars, the largest of the run. The fix list was precise and sorted into test rows vs code rows.

### 10. test-writer `afb1623` — close the fix list

- **Difficulties:** —
- **Went easily:** 4 gaps closed in 2.1 min; e2e 12/12 (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good.

### 11. plan-verifier `a77eaf8` — verify round 2

- **Difficulties:** 4 errors, 3 blocked; again it could not run e2e (stats, report).
- **Went easily:** re-checked only the failing rows, as asked (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good; it named the exact e2e command for the orchestrator.

### 12. security-reviewer `aeca3a2` — security

- **Difficulties:** 5 errors, 3 blocked (`grep -nE`, `awk`, `sed` ranges denied, `rg` broken). The skill path `~/.claude/skills/security/SKILL.md` did not exist (report).
- **Went easily:** a complete source→sink trace; it found M1 (client path traversal via `?pr=`) and M2 (uncapped `agentIds`), which no other agent caught (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good; each finding had a concrete fix.

## Workflow signals

- **Loop rounds:** architecture 3 (round 2 was an orchestrator staging error, not a code issue), verify 1 fix round, security 0. Without the staging slip it would have been 2 / 1 / 0.
- **Bounce-backs:** 0. No `fixed` finding came back.
- **Rework:** 10 files touched again by fix rounds out of 124 staged (6 for arch fixes, 4 for verify fixes; state + reports). Low.
- **Stop-and-ask:** 1 (Docker down), and it was necessary. The Docker check could have run before `/run-sdd` started.
- **User interventions:** 0 during the run. Before the run, in the same session (outside the window, from `user` messages): the user caught that the orchestrator had hand-patched the plan after a spec amendment instead of re-running `implementation-planner`. The re-run found 2 real bugs: 400 vs the existing 422, and unknown keys silently stripped instead of rejected. The user also asked for e2e coverage, which the pipeline had no owner for (applied, uncommitted). And the orchestrator wrongly said the agents had no preloaded skills and had to correct itself.
- **Blocked tool calls:** 16 across agents, all in read-only agents (plan-verifier 11, security 3, arch-reviewer 2). These are the same causes as retros 0001/0002.
- **Parallelism:** 2 parallel waves. The critical path was the client implementer at 12.1 min. The serial verify→security order was avoided: they ran in parallel in wave 10.
- **Stray files:** `{server,client}/pnpm-workspace.yaml` were recreated 4 times, by the orchestrator's install, wave-1 implementer, arch-reviewer and test-writer's e2e run (context, reports). Each time it was cleaned up by hand.
- **Cache / compactions:** main 0.99, 0 compactions. Healthy.
- **Token split:** main 41%, agents 59%. The client implementer (10.6M) and plan-verifier round 1 (5.7M) are the biggest.
- **Background agents and questions (pre-run):** `spec-creator` (2 passes) and `implementation-planner` (2 passes) each returned open questions because `AskUserQuestion` is unavailable to background agents. The orchestrator relayed 15 + 4 questions.

## Comparison with earlier retros

| Retro | Tokens | Agents | Rounds (arch / verify) | Active time |
|---|---|---|---|---|
| 0001 Project Context (`/run-sdd` sub-window) | 47.32M | 16 | 2 / 1 (+1 security) | 96 min |
| 0002 PR Brief | 86.07M (main includes follow-ups) | 18 | 2 / 1 | ~100 min build |
| **0003 Multi-Agent Review** | **49.24M** | **12** | **3 (1 wasted) / 1** | **51.7 min** |

This was the fastest and cheapest run per feature so far, even though it was the widest scope (4 packages + e2e).

Earlier proposals (checked with `git log --since=2026-10-03` on their target files):
- **P-0001-1 / P-0002-4 (allow `grep`, fix `rg` in read-only agents):** still **open**. There is no `grep` rule in `.claude/hooks/readonly-allowlist.mjs`. Recurring: 16 blocks here. Raised to the top, see P-0003-1.
- **P-0001-4 (background agents cannot ask the user):** still **open**, recurring before the run (4 relays).
- **P-0002-5 (delete only your own files / pnpm strays):** still **open**, recurring (4 strays). P-0003-2 proposes removing the cause instead.
- **P-0002-1 (live smoke step):** still **open**. This run also reports "no real page load", which is the same gap.
- **P-0002-3 (one reviewer per track):** partly addressed by `269a2c6` (2026-10-06, inline-diff input); not applied as written.
- **P-0001-2, -3, -5, -6, P-0002-2, -6:** no matching commits; still open, with no new evidence this run.

## Module insights

Candidate `INSIGHTS.md` lines — not written there; the user promotes them. (The agents already appended entries to `server/`, `client/` and `e2e/INSIGHTS.md` during the run; these are only the extra ones.)

### root

- 2026-10-10 · Hand-patching a Development Plan after a spec amendment skips the planner's code checks. The re-run on spec-0004 D-30 found that body-schema failures return 422 (`server/src/app.ts:126-137`), not the spec's 400, and that a non-`.strict()` zod object silently drops removed fields. Re-run `implementation-planner` on every spec amendment. (`docs/plans/0018-multi-agent-review.md`)
- 2026-10-10 · In zsh, `git add -- $F` with a space-separated list in one variable stages nothing ("pathspec … did not match"), because zsh does not word-split unquoted variables. List the paths literally, or use `git add --pathspec-from-file`. Verify with `git status --short -- <paths>` before spawning a reviewer on `--cached`. (`docs/plans/0018-multi-agent-review.state.json` log)

### client

- 2026-10-10 · API hooks build paths by template interpolation without `encodeURIComponent` (`client/src/lib/hooks/reviews.ts:136`), so any hook fed from a URL query or param (`?pr=` on Configure run) is a client-side path-traversal surface (security-reviewer `aeca3a2`, M1).

## Proposals

| ID | Target | Change | Evidence | Expected effect | Priority | Status |
|---|---|---|---|---|---|---|
| P-0003-1 | `.claude/hooks/readonly-allowlist.mjs` (read + verify profiles) | Supersedes P-0001-1 / P-0002-4. (a) Allow `grep -rn`/`grep -nE` (without `-f`) and `git grep -n` in every read-only profile. (b) Add `npm run e2e:hermetic` and `npm test` in `e2e/` to the `verify` profile, so plan-verifier can settle the e2e plan item itself. | 16 blocked calls this run (plan-verifier `a8fbc9b` 8, `a77eaf8` 3, security `aeca3a2` 3, arch `af1127f`/`a3fc654` 2); e2e `cannot-verify` twice, settled by the orchestrator; same blocks in 0001 and 0002 | blocked calls → ~0; no `cannot-verify` on e2e; fewer orchestrator workarounds | high | open |
| P-0003-2 | `.claude/settings.json` `env` (or `scripts/e2e.sh` + `scripts/dev.sh`) | Set `pnpm_config_verify_deps_before_run=false` (and `pnpm_config_strict_dep_builds=false`) for every session and subagent. This removes the `ERR_PNPM_IGNORED_BUILDS` failure that writes stray `pnpm-workspace.yaml` stubs, instead of telling each agent to clean up. | 4 stray yaml recreations (orchestrator install, `ad25f00`, `af1127f`, `af0fc74`); `pnpm typecheck`/`arch:check`/`e2e:hermetic` failed on it in 3 agents; same in P-0002-5 | stray files 0; `pnpm <script>` works directly; shorter prompts | high | open |
| P-0003-3 | `.claude/skills/run-sdd/SKILL.md`, step 2.1 and step 0 *Inputs* | (a) Step 2.1: stage with `git add --pathspec-from-file=<list>`, then require `git diff --name-only -- <changedPaths>` to be empty **before** spawning `architecture-reviewer`, never in the same message. (b) Step 0: check Docker (`docker info`), the global `agent-browser` and every package's `node_modules` up front, and ask once. (c) Step 0: stop if the spec was amended after the plan was last written (spec Decisions newer than the plan's citations), and ask to re-run `implementation-planner`. | Wasted arch round 2 (`a3fc654`, partly staged index); Docker stop-and-ask mid-run; hand-patched plan bugs caught only by the user-requested re-plan | arch rounds −1; no mid-run environment stop; no stale plans reach the build | medium | open |
| P-0003-4 | `.claude/agents/test-writer.md` *Input contract* | Before reporting "every ID covered", apply plan-verifier's `met` test rule to each ID: the test must trigger the AC's WHEN and assert its THEN. A composite title (`AC-28/29/31`) counts only for the IDs whose trigger it actually exercises. List per ID which assertion proves it. | `af0fc74` claimed full coverage; `a8fbc9b` found AC-20/28/29 not exercised and flow 12 missing 2 checks → one extra test-writer + verifier round (4.1 min, 1.32M tokens) | verify fix rounds → 0 for test-only gaps | medium | open |

Status: all `open`. Promoting any of them, and the module insights, is the user's call.
