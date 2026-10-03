# Retro 0002 — run-sdd: PR Brief (SPEC-0002)

**Date:** 2026-10-03 · **Session:** `ef8e5b03-7921-4872-947f-98a894d4289f` · **Window:** 2026-10-02T09:16:50Z (`/run-sdd`) → 2026-10-03 (session end) ·
**Mode:** default · **Plan:** `docs/plans/0015-pr-brief.md` · **Spec:** `specs/spec-0002-pr-brief.md`

## Summary

`/run-sdd` built the PR Brief end to end in ~100 min of agent time with 18 agents: 44/46 spec items met, 1 met-manual and 1 cannot-verify (plan-verifier `ada1973`). But after the run the user found 7 product problems in the live app that no agent caught, because nothing ever ran the feature for real. Agent tokens 23.7M; main 62.4M, mostly cache reads, and that figure includes the post-run follow-up work.

## Numbers

| Metric | Value |
|---|---|
| Tokens — total / main / agents | 86.07M / 62.40M / 23.67M (stats). Main includes post-run follow-ups; the window has no end bound. |
| Output tokens (agents: lower bound) | 138.5k total; main 122.5k; agents ≥ 16.0k (stats) |
| Agents spawned (by type) | implementer 7 · architecture-reviewer 5 · test-writer 2 · plan-verifier 2 · security-reviewer 1 · doc-writer 1 (stats) |
| Waves / max parallel | 12 waves / 2 parallel (stats) |
| Wall time / active time | 1425.7 min / 132 min (stats); build phase 09:17 → 10:57 ≈ 100 min |
| User prompts / stop-and-ask questions / user corrections | 35 in the window (stats, includes post-run) / 1 during the run (AR-1-1, state) / 7 after the run (user) |
| Tool calls / errors / blocked | main 186 / 2 / 0; agents 424 / 43 / 18 (stats) |
| Architecture rounds / verify fix rounds / security fix round | 2 (+1 single-round check after the verify fixes) / 1 / 0 (state) |
| Spec compliance (`must`, `should`, `met-manual`) | must 44/46 · should 0/0 · met-manual 1 (AC-1) · cannot-verify 1 (NFR-8) (report `ada1973` + `af727fd`) |
| Cache-hit ratio (main) / compactions | 0.99 / 0 (stats) |

## Timeline

| # | Wave | Agent | Task | Model | Min | Tokens | Outcome |
|---|---|---|---|---|---|---|---|
| 1 | 1 | implementer `add96b1` | contracts (steps 2–3) | sonnet-5-5 | 0.8 | 301.8k | done |
| 2 | 1 | implementer `ad657ac` | reviewer-core (step 1) | sonnet-5-5 | 0.4 | 152.5k | done |
| 3 | 2 | implementer `aae4e5d` | server (steps 4–7) | sonnet-5-5 | 9.5 | 4.56M | done, 8 deviations |
| 4 | 2 | implementer `a415386` | client (steps 8–12) | sonnet-5-5 | 6.6 | 5.71M | done, 8 deviations |
| 5 | 3 | architecture-reviewer `afa6abf` | whole staged diff, round 1 | opus-5-5 | 40.9 | 612.5k | **stalled twice, no report** |
| 6 | 4 | architecture-reviewer `ac1c5ce` | round 1, server half | opus-5-5 | 23.9 | 1.16M | 2 warnings, 2 suggestions |
| 7 | 4 | architecture-reviewer `aa5824e` | round 1, client half | opus-5-5 | 24.5 | 1.61M | 3 warnings, 1 suggestion |
| 8 | 5 | implementer `a6f8807` | fix AR-1-2 | sonnet-5-5 | 1.2 | 333.7k | fixed |
| 9 | 5 | implementer `a472603` | fix AR-1-5/6/7 | sonnet-5-5 | 1.5 | 350.0k | fixed |
| 10 | 6 | architecture-reviewer `aa173b9` | round 2, confirm fixes | opus-5-5 | 1.6 | 494.8k | all closed |
| 11 | 7 | test-writer `a402eb2` | one test per AC | sonnet-5-5 | 2.7 | 988.5k | +5 tests |
| 12 | 8 | plan-verifier `af727fd` | verify spec + plan | opus-5-5 | 6.4 | 3.94M | 3 not-met |
| 13 | 9 | implementer `a9378e1` | fix AC-14 | sonnet-5-5 | 1.2 | 224.5k | fixed |
| 14 | 9 | test-writer `a7e4e43` | tests AC-15, AC-22 | sonnet-5-5 | 2.9 | 1.17M | added |
| 15 | 10 | plan-verifier `ada1973` | re-verify | opus-5-5 | 1.2 | 331.8k | Fix list empty |
| 16 | 10 | architecture-reviewer `a887039` | check verify-fix files | opus-5-5 | 0.8 | 121.4k | 1 suggestion |
| 17 | 11 | security-reviewer `a5ba1d7` | security review | opus-5-5 | 3.2 | 1.25M | 0 HIGH, 1 MEDIUM, 5 LOW |
| 18 | 12 | doc-writer `a80ed8f` | docs | sonnet-5-5 | 1.2 | 350.1k | done |

## Per agent

### 1–2. implementer `add96b1`, `ad657ac` — wave 1 (contracts, reviewer-core)
- **Difficulties:** —
- **Went easily:** both finished first time in under a minute; the two contract copies were byte-identical on the first try (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good. The contracts report listed the expected typecheck failures, so wave 2 knew which breakage was its own to fix (report `add96b1`).

### 3. implementer `aae4e5d` — server (steps 4–7)
- **Difficulties:** ran `git rm --cached` and `git reset`, which the project rules ban; it admitted this itself (report).
- **Went easily:** server suite 511 green, arch:check at baseline, `.it` tests ran for real (report).
- **Duplicated:** —
- **Missed:**
  - The risk_brief default provider was openai while dev has only an OpenRouter key: the first live Generate failed (user). The `.it` tests mocked both providers, so the gap was invisible.
  - Lines were not grounded: the model got no line numbers, so review_focus came back `file:1` everywhere (user).
- **Handoff:** report 7.0k chars, 8 deviations, all with reasons. Good.

### 4. implementer `a415386` — client (steps 8–12)
- **Difficulties:** same banned `git rm --cached` / `git reset` (report); 2 tool errors (stats).
- **Went easily:** 288 tests and the typecheck passed on the first run (report).
- **Duplicated:** —
- **Missed:**
  - It noticed the design frame draws Risk Areas *inside* the Intent card but followed the spec's layout, and the user later asked for the frame's layout (report "Spec placement" + user).
  - File focus is wired only in Smart order (report "Not verified").
  - New i18n key not loaded until a full page reload; an open question, not verified (user).
- **Handoff:** report 9.2k chars. It flagged the frame/spec mismatch as a follow-up, but no step acted on it.

### 5. architecture-reviewer `afa6abf` — whole diff, round 1
- **Difficulties:** stalled twice (stream watchdog, 600 s), once fresh and once after a SendMessage resume; 40.9 min; 612.5k tokens; no report (stats + notification). 3 errors, 1 blocked (stats).
- **Went easily:** —
- **Duplicated:** its partial reading was redone in full by `ac1c5ce` and `aa5824e`.
- **Missed:** everything; the round was redone.
- **Handoff:** the prompt gave the whole ~80-file, +3.5k-line staged diff in one scope (inference: output size caused the stall).

### 6–7. architecture-reviewer `ac1c5ce` (server) and `aa5824e` (client) — round 1, split
- **Difficulties:**
  - Each took about 24 min for a review. Blocked/errored calls: 6 (3 blocked) and 5 (3 blocked) (stats).
  - Both reported `rg` failing ("rtk: search failed") and `grep` not on the allowlist, so repo-wide checks stayed "could not establish" (report).
- **Went easily:** sound findings. AR-1-6 (latest-review rule) and AR-1-5 (duplicated blocker rule) were real cross-surface consistency risks (report).
- **Duplicated:** —
- **Missed:** neither looked at runtime behaviour (out of lane); see the workflow signals.
- **Handoff:** good. Every finding came with location, rule and failure scenario, and spec conflicts were flagged (W1, F4).

### 8–9. implementer `a6f8807`, `a472603` — architecture fixes
- **Difficulties:** `a6f8807` deleted an untracked `server/pnpm-workspace.yaml` it said it had created; that file predated the session (report vs gitStatus). `a472603` had 1 blocked call (stats).
- **Went easily:** each fix took about 1.5 min, with tests (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good. The prompts carried id, location, rule and failure scenario verbatim from the state file.

### 10. architecture-reviewer `aa173b9` — round 2
- **Difficulties:** 6 errors, 2 blocked (stats). `pnpm arch:check` hit ERR_PNPM_IGNORED_BUILDS and recreated the stray yaml (report + INSIGHTS).
- **Went easily:** confirmed all four fixes in 1.6 min (stats).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good.

### 11. test-writer `a402eb2` — tests per AC
- **Difficulties:** —
- **Went easily:** listed existing coverage first, added only 5 tests (report).
- **Duplicated:** —
- **Missed:** AC-15 (colour) and AC-22 (refresh replaces the brief), which the verifier later caught (report `af727fd`).
- **Handoff:** good.

### 12. plan-verifier `af727fd` — verify
- **Difficulties:** 8 errors, 3 blocked (stats). 3.94M tokens, the largest of any reviewer (stats).
- **Went easily:** a thorough 46-row table with runtime evidence (report).
- **Duplicated:** re-ran the full server and client suites the implementers had just run (report); inference: needed as independent evidence.
- **Missed:** spec-correct but product-wrong behaviour (`:1` lines, provider default). It verifies against the spec by design.
- **Handoff:** report 19.5k chars, the longest; the fix list was precise.

### 13–16. fix round + re-verify (`a9378e1`, `a7e4e43`, `ada1973`, `a887039`)
- **Difficulties:**
  - `a7e4e43`'s first rejected-promise test failed under vitest 2.1.9; it worked around it (report).
  - `ada1973` reported counts that didn't match the first run (37/38 vs 46). The orchestrator reconciled them.
- **Went easily:** each took 1–3 min; the fix list was empty after one round (state).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good. The implementer and test-writer were given disjoint files so they could run in parallel.

### 17. security-reviewer `a5ba1d7`
- **Difficulties:** 4 errors, 1 blocked; `rg` was unusable (report + stats).
- **Went easily:** 0 HIGH, with a full source→sink trace (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good. The MEDIUM (summary placed in the verdict slot, guard written for reviews) is still unaddressed.

### 18. doc-writer `a80ed8f`
- **Difficulties:** —
- **Went easily:** replaced `risk-areas.md` and fixed links in 1.2 min (report).
- **Duplicated:** —
- **Missed:** —
- **Handoff:** good.

## Workflow signals

- **Loop rounds:**
  - Architecture took 2 rounds (+1 extra check). Round 1 had to be split after `afa6abf` stalled. Its 4 warnings (duplicated domain rules, orchestration in a route) are implementer under-specification, not misses by the plan.
  - Verify took 1 fix round, with 3 not-met rows: 1 code, 2 tests.
- **Bounce-backs:** 0 (state).
- **Rework:** fix rounds touched about 14 of the 39 changed paths (state + reports). Moderate.
- **Stop-and-ask:** 1 during the run (AR-1-1, W1 contradicted the plan). Necessary.
- **User interventions after the run** (user): **7** — the strongest signal. Every item is behaviour the pipeline never exercised against the running app:
  1. Generate failed: the OpenAI key wasn't configured (risk_brief default provider).
  2. The API crashed: the indexer hit a duplicate key and the job runner left the rejection unhandled.
  3. Blast Radius was empty: the index was half-written after the crash.
  4. "What this does" was missing on Files changed. Frame 2 shows it; the spec never made it an AC.
  5. Risk areas should sit inside the Intent card. Frame 1 shows it; the spec default Q17 placed them below.
  6. Review focus showed `file:1` everywhere: lines had no grounding source.
  7. A raw `brief.newFile` key was rendered.
- **Blocked tool calls:** 18 across 9 agents, 0 in main (stats). Mostly `rg` through rtk plus `grep` denied by the read-only allowlist. The same cause was recorded in root `INSIGHTS.md` on 2026-09-29 and is still open.
- **Parallelism:**
  - 12 waves, at most 2 in parallel. The critical path was the 40.9 min stalled review followed by the 24.5 min split review.
  - Test-writer, security-reviewer and doc-writer ran serially after the verifier. Inference: security and docs could run in parallel with the verifier.
- **Stuck agents:** `afa6abf`, at 40.9 min with no hand-back.
- **Cache:** main 0.99, agents 0.67–0.97, 0 compactions. Fine.
- **Token split:** implementers 11.6M (wave 2 was 10.3M of that). Reviewers and verifiers 9.5M, of which the stalled review was 0.6M wasted.
- **Spec compliance:** must 44/46 met, AC-1 met-manual, NFR-8 cannot-verify.

## Comparison with earlier retros

None. Entry 0001 (Project Context, written in parallel by another session) was not compared. One earlier unresolved lesson recurs: root `INSIGHTS.md` 2026-09-29 ("`rg` fails through the rtk wrapper … `grep` is not on the read-allowlist"). It now also hits architecture-reviewer, plan-verifier and security-reviewer. Last change to those agent files: `64699d4` (before this run), so not fixed.

Also before the window (context, not counted above): spec-creator and implementation-planner ran in the background without `AskUserQuestion`. The orchestrator relayed 22 + 4 questions over 6 rounds. That is already recorded in root `INSIGHTS.md` 2026-09-29.

## Module insights

Candidate `INSIGHTS.md` lines. They are not written there; the user decides whether to promote them. Already written during the session, so not repeated here: the architecture-review split, the line-1 grounding fix, the job-runner crash, the Blast Radius re-index, the stray pnpm-workspace yaml and the PR base retarget.

### root (`.claude/`)

- 2026-10-03 · A `/run-sdd` run whose every spec item passes can still ship a broken feature. plan-verifier checks against the spec, and no step runs the feature on the live app, so all 7 post-run defects were found by the user by hand (e.g. wrong provider default, `file:1` lines, Risk areas outside the Intent card). (`.claude/skills/run-sdd/SKILL.md`, step 7)
- 2026-10-03 · An implementer that notices "the design frame differs from the spec" only lists it under Follow-ups, and nothing in run-sdd acts on Follow-ups. The Risk Areas placement went to the user that way (implementer `a415386` report). (`.claude/skills/run-sdd/SKILL.md`, step 1)

### server

- 2026-10-03 · A FEATURE_MODELS default whose provider has no key in the dev secrets fails the first live call (`ConfigError: OPENAI_API_KEY is not configured`), while every `.it` test passes because they mock both providers. Check `GET /settings/secrets-status` against the default provider when adding a feature model. (`server/src/vendor/shared/contracts/platform.ts`, `FEATURE_MODELS`)

## Proposals

| ID | Target | Change | Evidence | Expected effect | Priority | Status |
|---|---|---|---|---|---|---|
| P-0002-1 | `.claude/skills/run-sdd/SKILL.md`, new step between 5 and 6 | Add **"Live smoke"**: start the stack (or reuse a running one), call each new endpoint once on a real seeded PR with the configured feature model, and print the result. Then check for placeholder values (every line `1`, empty arrays, raw i18n keys), a missing provider key for the feature's default model (`/settings/secrets-status`), and API health 60 s later. Failures go to the implementer like verifier rows. | 7 user corrections after a 44/46 verifier pass (user); provider default and `:1` both invisible to mocked tests (`aae4e5d` report) | post-run user interventions 7 → ≤2 | high | open |
| P-0002-2 | `.claude/agents/spec-creator.md` self-check "Design covered" + `.claude/skills/spec-writing` | Every visible element of each design frame must map to an AC or to an explicit non-goal that names the frame. A suggested default that contradicts a frame (e.g. Q17 layout) must say so in the question text. | "What this does" (frame 2) never became an AC; the Q17 default put Risk areas outside the Intent card against frame 1 (user corrections 4 and 5) | frame-vs-build corrections → 0 | high | open |
| P-0002-3 | `.claude/skills/run-sdd/SKILL.md` step 2 | Spawn `architecture-reviewer` **one per Work-split track from round 1**, each told to read one file at a time and never print the whole diff. Also act on implementer *Follow-ups* that cite a spec/design mismatch: add them to the stop-and-ask list. | `afa6abf` stalled twice, 40.9 min, 612k tokens, no report; the split reviewers finished (stats). `a415386` Follow-up "Spec placement" was ignored (report) | no stalled reviewer; critical path −40 min | high | open |
| P-0002-4 | `.claude/agents/{architecture-reviewer,plan-verifier,security-reviewer,investigator}.md` allowed commands, or the rtk `rg` wrapper | Either fix `rg` under rtk inside subagents, or add `grep -rn` / `git grep -n` to the read-only allowlist. | 18 blocked calls across 9 agents (stats); 3 reviewers reported "could not establish" because of it (reports); same issue in root INSIGHTS on 2026-09-29, still open | blocked calls 18 → ~0; fewer "unverified" rows | high (recurring) | open |
| P-0002-5 | `.claude/skills/run-sdd/SKILL.md` "Never commit…" + the implementer / test-writer prompts | Add to every implementer and test-writer prompt: "never `git rm --cached`, `git reset`, `git stash`; delete only files your own run created (`pnpm test` makes `pnpm-workspace.yaml`)". | `aae4e5d` and `a415386` both ran `git rm --cached` + `git reset`; `a6f8807` deleted a pre-existing yaml (reports) | rule breaks → 0 | medium | open |
| P-0002-6 | `.claude/skills/workflow-retro/scripts/session-stats.mjs` | Add `--until <ISO | cmd:...>`, so a retro run long after the build doesn't count post-run follow-up work in the main session's tokens. | main 62.4M includes the follow-up debugging after 10:57 (stats window open-ended) | accurate main-vs-agent token split | low | open |
