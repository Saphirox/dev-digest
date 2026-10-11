# Retro 0003 — run-sdd: Export to CI

**Date:** 2026-10-10 · **Session:** `dddf10b8-6a40-4182-b1f6-40dc43033f26` · **Window:** `cmd:run-sdd` (13:36 UTC) → end of security re-check + main-session fix ·
**Mode:** default · **Plan:** `docs/plans/0018-export-to-ci.md` · **Spec:** `specs/spec-0004-export-to-ci.md`

## Summary

The run built Export to CI across client and server (70 staged files). The final plan-verifier pass met all 53 `must` items, and a further security pass fixed two HIGH issues plus a leftover. It cost 37.84M tokens (main 14.30M, 16 agents 23.54M) over 51.5 min wall.

## Numbers

| Metric | Value |
|---|---|
| Tokens — total / main / agents | 37.84M / 14.30M / 23.54M (stats) |
| Output tokens (agents: lower bound) | 62.4k total; main 40.9k (stats) |
| Agents spawned (by type) | implementer 7 · architecture-reviewer 3 · plan-verifier 2 · test-writer 2 · security-reviewer 2 (stats) |
| Waves / max parallel | 12 waves; max 3 in wave 10. Wave 2 had 2 truly parallel tracks (stats) |
| Wall time / active time | 51.5 min / 57.7 min (stats) |
| User prompts / stop-and-ask questions / user corrections | 21 prompts (whole session, stats) / 1 stop-and-ask (runner bundle, context) / 0 corrections. 2 user-initiated detours: roll back migration 0020, then re-apply it and run the `.it` tests (user) |
| Tool calls / errors / blocked | 429 agent + 57 main tool calls / 41 errors / 17 blocked, all in read-only agents (stats) |
| Architecture rounds / verify fix rounds / security fix round | 3 / 1 (2 verifier runs) / 1 fix round + 1 re-check + 1 main-session fix (state) |
| Spec compliance (`must`, `should`, `met-manual`) | 53/53 · 0/0 · 0 `met-manual`. 5 frame checks were left optional for the user (plan-verifier `ae8ce01` + `a467d18`) |
| Cache-hit ratio (main) / compactions | 0.99 / 0 (stats) |

## Timeline

| # | Wave | Agent | Task | Model | Min | Tokens | Outcome |
|---|---|---|---|---|---|---|---|
| 1 | 1 | implementer `a806e76` | Contracts (steps 1–2) | sonnet | 1.7 | 707.6k | done; installed node_modules in 4 packages |
| 2 | 2 | implementer `a87c9ff` | Server track (3–10) | sonnet | 10.2 | 7.48M | 3–9 done; **step 10 blocked** (ncc emits 3 files) |
| 3 | 2 | implementer `ab99adb` | Client track (11–15) | sonnet | 7.0 | 4.72M | done, 410 tests |
| 4 | 3 | implementer `ab5367e` | Step 10, multi-file runner (after user decision) | sonnet | 2.7 | 687.8k | done |
| 5 | 4 | architecture-reviewer `ac1163c` | Round 1 | opus | 3.4 | 1.23M | 3 warnings, 2 suggestions |
| 6 | 5 | implementer `a0c3ed2` | Fix AR-1-1..3 | sonnet | 3.1 | 686.8k | done |
| 7 | 6 | architecture-reviewer `af0c1fc` | Round 2 | opus | 2.8 | 970.2k | round 1 closed; **2 new warnings** |
| 8 | 7 | implementer `a5c86f2` | Fix AR-2-1, AR-2-2 | sonnet | 1.3 | 254.5k | done |
| 9 | 8 | architecture-reviewer `add0a88` | Round 3 | opus | 0.6 | 98.7k | clean |
| 10 | 9 | test-writer `a4b0c6b` | One test per AC/EC | sonnet | 1.7 | 289.9k | +4 tests |
| 11 | 10 | plan-verifier `a467d18` | Verify | opus | 8.3 | 4.06M | 51/53; EC-2 and NFR-2 test-side gaps |
| 12 | 10 | test-writer `a44b87f` | EC-2, NFR-2 tests | sonnet | 0.6 | 112.1k | +9 tests |
| 13 | 10 | plan-verifier `ae8ce01` | Re-verify | opus | 0.9 | 153.8k | 53/53 |
| 14 | 10 | security-reviewer `aa6fa3b` | Security review | opus | 4.2 | 1.56M | 2 HIGH, 2 MEDIUM, LOWs |
| 15 | 11 | implementer `a0293f6` | Fix SEC-1/2 | sonnet | 1.3 | 259.6k | done, but try/catch scope narrowed |
| 16 | 12 | security-reviewer `acdb29c` | Re-check | opus | 1.7 | 277.5k | SEC-2 closed; SEC-1 corrupt-zip path still open → fixed by main |

## Per agent

### 1. implementer `a806e76` — contracts
- **Difficulties:** `pnpm install` created stray `pnpm-workspace.yaml` in 3 packages; it deleted them (report).
- **Went easily:** 1.7 min, typechecks in three packages, consumer search done (report).
- **Duplicated:** —
- **Missed:** — (no later finding on the contracts until SEC-1 bounds, which the spec did not ask for).
- **Handoff:** the report's consumer list and env notes (ERR_PNPM_IGNORED_BUILDS, stray workspace file) were forwarded to wave 2 (context). Good.

### 2. implementer `a87c9ff` — server track
- **Difficulties:** the step 10 blocker (ncc emits `index.js` + `300.index.js` + `package.json`). It stopped as instructed (report). The largest context at 7.48M, 54 calls (stats).
- **Went easily:** steps 3–9, with 680 tests and 0 skipped on the first hand-back (report).
- **Duplicated:** re-learned the `pnpm db:migrate` / `pnpm typecheck` failure that root INSIGHTS 2026-09-16 already records (report "unusable here").
- **Missed:** AR-1-1 (`.status` mapping in service), AR-1-2 (workspace scope), AR-2-1 (insert branch); SEC-1 (unbounded ints, no per-run catch) and SEC-2 (skipped fork runs). Every security HIGH sits in its code (state).
- **Handoff:** the report was clear and listed its deviations.

### 3. implementer `ab99adb` — client track
- **Difficulties:** pnpm scripts failed again (ERR_PNPM_IGNORED_BUILDS); it fell back to binaries (report).
- **Went easily:** 7 min, 410 tests, no blockers (report).
- **Duplicated:** the same pnpm workaround as `a87c9ff`.
- **Missed:** AR-1-3 (hard-coded workflow path instead of `CiFile.editable`) and AR-1-4 (deep import) (state).
- **Handoff:** good; it listed 4 deviations from frame and spec explicitly.

### 4. implementer `ab5367e` — step 10 rework
- **Difficulties:** —
- **Went easily:** 2.7 min. It verified the built runner starts without a missing-module crash (report).
- **Duplicated:** —
- **Missed:** stale comments in `config.ts`/`container.ts`, caught by `ac1163c` (report).
- **Handoff:** it reported that the client needed no change, which saved a client round.

### 5–9. architecture-reviewer ×3 + fixers
- **Difficulties:** 5 blocked calls across 3 rounds. `rg` fails and `grep`/`git -C` are denied, so each reviewer listed falsifiers it "could not check" (reports `ac1163c`, `af0c1fc`, `add0a88`).
- **Went easily:** round 3 took 0.6 min, scoped to 3 files.
- **Duplicated:** round 2 re-read untouched context to judge the fixes (inference from the 970k tokens for 14 files).
- **Missed:** round 1 did not flag that AR-1-2's fix needed the insert path too; round 2 found it as AR-2-1.
- **Handoff:** fixer `a0c3ed2` fixed only the cited lines of AR-1-2, leaving the insert branch unscoped. That is the root of round 3.

### 10, 12. test-writer `a4b0c6b`, `a44b87f`
- **Difficulties:** —
- **Went easily:** it checked every implementer coverage claim and found no false ones; fast (reports).
- **Missed:** `a4b0c6b` did not notice that EC-2 and NFR-2 tests drove only the mock, never the adapter. The verifier caught it (`a467d18`).
- **Handoff:** good.

### 11, 13. plan-verifier `a467d18`, `ae8ce01`
- **Difficulties:** 6 + 2 blocked calls (stats). `a467d18` ran 8.3 min and 4.06M tokens, the largest reviewer. It was resumed mid-run by the main session's rollback notice and sent a **second, duplicate hand-back** (context).
- **Went easily:** it re-ran every suite itself and gave precise test-side gaps (report).
- **Duplicated:** the second hand-back repeated round 1 entirely, which cost a main-session turn.
- **Missed:** —
- **Handoff:** clear fix list, with test rows only.

### 14–16. security-reviewer `aa6fa3b`, fixer `a0293f6`, `acdb29c`
- **Difficulties:** 2 + 2 blocked calls.
- **Went easily:** a broad, well-traced first pass with an explicit "verified safe" list.
- **Missed:**
  - `aa6fa3b` named "the Postgres write" as SEC-1's sink. It missed the second throw point on the same untrusted source (`unzipSync`), which `acdb29c` found.
  - Fixer `a0293f6` narrowed the try/catch to `saveCiRun` to keep EC-15. That was reasonable, but it left the zip path open.
  - The leftover HIGH was fixed by the main session after the user's "if you find errors, fix them" (user). That exceeds run-sdd's one security fix round.
- **Handoff:** good.

## Workflow signals

- **Loop rounds:**
  - Architecture took 3 rounds (vs 2 in 0001/0002). Round 2's two new warnings came from round 1's fixes: one partial fix and one new error class (state).
  - Verify needed 1 fix round, which was test-only.
  - Security needed 1 fix round, and its re-check still found a HIGH.
- **Bounce-backs:** none formally. AR-1-2 → AR-2-1 behaved like one: the same rule on the same method, missed on a second code path.
- **Rework:** fix rounds touched 14 files (arch r1), 3 (arch r2), 7 (security) and 5 (main) out of 70. Unique count `n/a`.
- **Stop-and-ask:** 1, about the runner bundle. It was necessary because the plan's single-file assumption was false. The planner had listed it as a risk but could not build (planner report). A one-command probe before wave 2 would have turned it into a planning question instead of a mid-build stop.
- **User interventions:**
  - 0 corrections.
  - 2 detours (DB rollback, then re-apply + `.it` run). The rollback forced the main session to message a running verifier, whose resume produced the duplicate hand-back.
- **Blocked tool calls:** 17, all in read-only agents (stats). The `rg`/`grep` gap was reported in 0001 and 0002 and is still open.
- **Parallelism:**
  - Wave 2's server track (10.2 min) was the critical path.
  - Verify ran in parallel with the test-writer fix.
  - Security started only after verify finished, but its files did not overlap and it could have started right after arch round 3 (inference).
- **Token split:** main 38%. Server implementer 32% of agent tokens, plan-verifier `a467d18` 17%.
- **Spec compliance:** 53/53 `must` is the best outcome of the three retros (0001: 39/42, 0002: 44/46).

## Comparison with earlier retros

- **Cost and time vs 0001 (`/run-sdd` window) and 0002 (agents):** 37.84M total vs 47.32M and 23.67M. 16 agents vs 16 and 18. 51.5 min wall vs about 96 min and about 100 min active. Cheaper and faster than both, with full compliance.
- **Regression:** 3 architecture rounds vs 2.
- **Open proposals:**
  - P-0001-1 / P-0002-4 (`grep` or a working `rg` for read-only agents): **still open**. Recurring evidence of 17 blocks this run, so the priority rises (see P-0003-1).
  - P-0001-4 (background agents have no `AskUserQuestion`): **still open**. Both `spec-creator` and `implementation-planner` again returned questions instead of asking, before this window (context). Already in root INSIGHTS 2026-09-29.
  - P-0002-3 (one architecture-reviewer per track): related commit `269a2c6` (2026-10-06, inline-diff input), but no per-track split. Still open.
  - P-0002-1 (live smoke), P-0002-5 (no `git rm --cached`/`stash`): no evidence either way this run. Not applied (`git log` on `.claude/skills/run-sdd` since 2026-10-03 is empty).
  - P-0001-6 / P-0002-6 (stats script): not applied. The duplicate verifier hand-back shows that resumes still matter.

## Module insights

Candidate `INSIGHTS.md` lines — not written there; the user promotes them. Three server lessons (int/finite bounds, `withRetry` + parser errors, skipped fork runs) were already appended to `server/INSIGHTS.md` at the end of the build task, so they are omitted here.

### server

- 2026-10-10 · `pnpm db:migrate` in a worktree fails with "DATABASE_URL is required" because there is no `server/.env` there. Run `DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest ./node_modules/.bin/tsx src/db/migrate.ts`. Rolling back a migration by hand means: drop its objects in one transaction and delete its `drizzle.__drizzle_migrations` row, matched by `hash` = sha256 of the `.sql` file. Re-applying then works, even after another worktree has inserted a later row, because the migrator compares journal timestamps. (`server/src/db/migrate.ts`)

### client

- 2026-10-10 · The vendor `Chip` has no `aria-pressed`, so a toggle-chip group (the wizard's trigger chips) is not distinguishable to screen readers. Fixing it means a deliberate vendor-UI edit. (`client/src/vendor/ui`, `ExportCiWizard/_components/ConfigureStep/ConfigureStep.tsx`)

### root

- 2026-10-10 · Resuming a finished background agent with `SendMessage` (e.g. to tell it the DB changed) makes it send a **second full hand-back**. To tell a finished agent something, either don't message it, or ask it in that message to reply with a one-line acknowledgement only. (context: plan-verifier `a467d18`)

## Proposals

| ID | Target | Change | Evidence | Expected effect | Priority | Status |
|---|---|---|---|---|---|---|
| P-0003-1 | `.claude/hooks/readonly-allowlist.mjs` (or the rtk `rg` wrapper) | Same change as P-0001-1 / P-0002-4, now evidenced in a third run: allow `grep -rn` / `git grep -n` (and `git -C <worktree>`) for read-only agents, or fix `rg` under rtk. | 17 blocked calls (stats). Every reviewer and verifier listed "could not establish" items that one search would have settled (`ac1163c`, `af0c1fc`, `add0a88`, `a467d18`, `aa6fa3b`, `acdb29c`). | Blocked calls → ~0; fewer unverified falsifiers | high | open |
| P-0003-2 | `.claude/skills/run-sdd/SKILL.md` step 1 *Build* | Add a fixed **Environment block** that the orchestrator pastes into every implementer and test-writer prompt: "use `./node_modules/.bin/{tsc,vitest,depcruise,tsx}`; `pnpm <script>` may hit ERR_PNPM_IGNORED_BUILDS; delete any `pnpm-workspace.yaml` you create; `db:migrate` needs `DATABASE_URL=…`". This replaces per-agent rediscovery, and the lessons are already in root INSIGHTS. | `a806e76`, `a87c9ff` and `ab99adb` each rediscovered the pnpm failure; `a87c9ff` also hit `db:migrate` (reports) | Less implementer time/tokens; no stray files | medium | open |
| P-0003-3 | `.claude/skills/run-sdd/SKILL.md` step 0 *Inputs* + `.claude/agents/implementation-planner.md` *Risks* | When a plan Risk is settleable by one command the planner could not run (a build, a `ls dist`, a `\d table`), the planner marks it `probe: <command>`. run-sdd runs each probe before wave 1 and stops-and-asks then, not mid-wave. | Step 10 blocked mid-build on a risk the planner had already named (planner report; `a87c9ff` report) | The stop-and-ask moves before the build; no rework agent (`ab5367e`) | medium | open |
| P-0003-4 | `.claude/skills/run-sdd/SKILL.md` step 2.5 (*Fix*) and step 5 (security fix) | Add to every fix prompt: "a finding names one location; apply its rule to every code path of the same method/source (all writes, all parse/decode steps), and list each path you changed or deliberately left." | AR-1-2 → AR-2-1 (insert branch missed), SEC-1 → corrupt-zip leftover (state, `af0c1fc`, `acdb29c`) | Architecture rounds 3 → 2; security re-check clean on the first try | medium | open |
| P-0003-5 | `.claude/skills/run-sdd/SKILL.md` step 5 ordering | Start `security-reviewer` right after the architecture loop closes, in parallel with test-writer/plan-verifier, because it is read-only and file-disjoint. | Security started at wave 10 after verify (stats); no file overlap (inference) | Shorter critical path (~4 min here) | low | open |
