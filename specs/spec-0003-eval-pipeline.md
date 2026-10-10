# Spec: Eval pipeline for review agents

Spec ID: SPEC-0003
Status: approved
Supersedes: —
Modules: server (owner), client
Design: specs/images/spec-0003/finding-card-eval-action.png, specs/images/spec-0003/agent-editor-evals-tab.png, specs/images/spec-0003/eval-case-modal.png, specs/images/spec-0003/eval-dashboard.png, specs/images/spec-0003/agent-eval-page.png, specs/images/spec-0003/compare-runs-modal.png

## Problem and user

A DevDigest user who edits a review agent (its system prompt, model or linked
skills) cannot tell whether the change made the agent better or worse. They
only find out on the next real PRs. The accept/dismiss decisions they already
make on findings are labelled data, but nothing turns them into a repeatable
check. The user needs a fixed set of cases per agent, built from those real
decisions, plus a run that scores the agent on the set in numbers (recall,
precision, citation accuracy) and lets them compare two runs and restore the
better version.

## Goals / Non-goals

Goals:
- Create an eval case from a real finding in one click; also create, edit, run and delete cases by hand.
- List an agent's eval set and run the agent on every case in it with fixed inputs, asynchronously.
- Score each run with deterministic code only (no model call) and keep a run history per agent, including the exact prompt each run used.
- Compare two runs of one agent side by side (metrics, cost, prompt diff) and promote a version by restoring it as a new version.
- An Eval Dashboard page across all agents, with trends and a "Run all agents" action.
- Course acceptance, as a demo: an agent's set holds at least 8 cases, both expectation types work, and in an experiment a changed system prompt moves recall or precision between two runs. Reaching 8 cases is a demo precondition the user meets by reviewing real PRs and deciding findings (D-16); the feature does not guarantee it. Model output is not deterministic, so metric movement is an observation of the experiment, not a guarantee of the feature.

Non-goals:
- A `pnpm verify:l06` script or any requirement on it (declined by user, D-2).
- The "Run on save" toggle, the Files / PR meta input tabs and the "Finding skeleton" button of the case modal (declined by user, D-3).
- The agent switcher dropdown on the per-agent eval page (declined by user, D-15).
- Seeding eval cases, or changing where cases come from to reach 8 (declined by user, D-6, D-16).
- Fallbacks for findings with no producing agent or no stored patch (declined by user, D-6).
- Scoring the cases that succeeded when one case's model call fails (declined by user, D-7).
- Counting unlabelled findings in `must_find` cases as noise (declined by user, D-9).
- An "active version" pointer separate from the agent's latest version (declined by user, D-17).
- The "Learn" and "Reply to author" buttons shown in `finding-card-eval-action.png`: they belong to other features and do not exist in the finding card today; this spec adds only "Turn into eval case".
- Eval cases owned by a skill (`owner_kind = 'skill'` exists in the schema; this spec covers agent-owned cases only).
- Any LLM-as-judge scoring; running evals in CI.

## User stories

- As an agent author, I want to turn a finding I accepted into "must find X at file:line", so that a later prompt change that loses it shows up as a recall drop.
- As an agent author, I want to turn a finding I dismissed into "must not flag Y", so that a prompt change that brings the noise back shows up as a precision drop.
- As an agent author, I want to compare the run before and after my prompt edit and restore the better version, so that I can roll back a regression without retyping the old prompt.

## Acceptance criteria (EARS)

Terms: an agent's **eval set** is every eval case with `owner_kind = 'agent'` and `owner_id` = that agent. A **suite run** is one execution of the agent over its whole eval set; a **case result** is the outcome for one case, inside a suite run or from a single-case run. A run's **effective prompt** is the agent system prompt plus the bodies of the enabled linked skills, in link order, as sent to the engine.

Creating cases from findings

- **AC-1** `[server, client]` `must` WHEN the user clicks "Turn into eval case" on an accepted finding, the API (`POST /findings/:id/eval-case`) shall store one eval case in the eval set of the agent that produced the finding's review, whose `expected_output` has `kind: "must_find"` and the finding's `file`, `start_line` and `end_line`.
- **AC-2** `[server, client]` `must` WHEN the user clicks "Turn into eval case" on a dismissed finding, the API (`POST /findings/:id/eval-case`) shall store one eval case whose `expected_output` has `kind: "must_not_flag"` and the finding's `file`, `start_line` and `end_line`.
- **AC-3** `[server]` `must` WHEN an eval case is created from a finding, the API shall store as `input_diff` the stored patch of the finding's file in the review's PR, preceded by the file's `diff --git a/<file> b/<file>`, `--- a/<file>` and `+++ b/<file>` header lines, so that parsing the stored diff yields that file with the patch's hunks and later PR re-syncs do not change the case.
- **AC-4** `[server]` `must` WHEN an eval case is created from a finding, the API shall store the finding's `title`, `severity`, `category` and source finding id with the case, so the case list can label the case and EC-2 can detect a duplicate.
- **AC-5** `[server]` `must` IF a create or update request carries an `expected_output` whose `kind` is not `must_find` or `must_not_flag`, or whose `start_line` is below 1 or above `end_line`, THEN the API shall reject it with a 422 `validation_error` and store nothing.
- **AC-6** `[client]` `must` WHEN the API confirms the eval case was created, the finding card shall show that the finding is now an eval case, naming the expectation type.

Listing the set

- **AC-7** `[server, client]` `must` WHEN the user opens the "Evals" tab in the agent editor, the tab shall list every case in the agent's eval set from `GET /agents/:id/eval-cases`, each row showing the case name, the expectation type, the latest case result as "passed", "failed" or "never run", and the expected vs produced finding counts of that result.
- **AC-8** `[server, client]` `must` The Evals tab shall show the count of cases that passed in the latest finished suite run out of the cases in that run (for example "3 / 5 passing").

Running

- **AC-9** `[server]` `must` WHEN `POST /agents/:id/eval-runs` is accepted, the API shall review every case in the agent's eval set with the agent's current configuration and store one suite run with one case result per case.
- **AC-10** `[server]` `must` The API shall review each case through the same review engine as a PR review, with only these inputs: the case's stored `input_diff`, the agent's system prompt, model, provider and strategy, the bodies of its enabled linked skills, and one fixed task line identical for every case and run; it shall not add repo-intel context, project-context documents, memory, PR intent or PR description, whatever the agent's `repo_intel` and `context_paths` settings, so two suite runs with the same configuration on the same set send identical inputs (outputs may still differ).
- **AC-11** `[server]` `must` WHEN a suite run ends, the API shall store with it the agent id, the agent version number at start, the start time, status (`done` or `failed`), recall, precision, citation accuracy, cases passed, cases total, total cost, and the run's effective prompt, model and provider.
- **AC-12** `[server, client]` `must` WHEN the user clicks "Run all evals" in the Evals tab or "Run eval" on the per-agent eval page, the client shall call `POST /agents/:id/eval-runs` and, once the run's status leaves `running`, refresh the case statuses, metric tiles and run list.

Scoring (pure code)

- **AC-13** `[server]` `must` The scorer shall count a produced finding as matching an expectation WHEN the file paths are equal and the inclusive line ranges `[start_line, end_line]` overlap.
- **AC-14** `[server]` `must` The scorer shall compute recall as the number of `must_find` cases with at least one matching grounded finding divided by the number of `must_find` cases in the run.
- **AC-15** `[server]` `must` The scorer shall compute precision as the number of grounded findings that match no `must_not_flag` expectation of their case divided by the number of grounded findings produced in the run.
- **AC-16** `[server]` `must` The scorer shall compute citation accuracy as the number of findings kept by the grounding gate divided by the number kept plus the number dropped, summed over all cases of the run.
- **AC-17** `[server]` `must` The scorer shall mark a `must_find` case passed WHEN at least one grounded finding matches it, and a `must_not_flag` case passed WHEN no grounded finding matches it.

Viewing, comparing and promoting

- **AC-18** `[server, client]` `must` WHEN the Evals tab or the per-agent eval page loads and a finished suite run exists, it shall show recall, precision and citation accuracy of the latest `done` suite run, each with its signed change against the previous `done` suite run of the same agent, from the `EvalDashboard` payload (`current`, `delta`).
- **AC-19** `[server, client]` `must` The per-agent eval page shall list the agent's suite runs newest first, each row showing ran-at time, agent version (`vN`), status, recall, precision, citation accuracy, cases passed / total, and cost.
- **AC-20** `[client]` `must` WHILE exactly two `done` suite runs are selected in the run list, the per-agent eval page shall enable "Compare".
- **AC-21** `[server, client]` `must` WHEN the user clicks "Compare", the compare view shall show for recall, precision, citation accuracy and cost the older run's value, the newer run's value and the signed change, plus a line diff of the two runs' saved effective prompts and, where they differ, their models and providers.
- **AC-22** `[client]` `must` The left sidebar shall show an "Eval Dashboard" item in the Skills Lab group that opens the Eval Dashboard page and is highlighted while that page is open.
- **AC-23** `[server, client]` `must` The Eval Dashboard shall list one row per existing agent with at least one eval case, showing the agent name, model, latest suite run version, time and cases passed / total, and its recall, precision and citation accuracy.
- **AC-24** `[server, client]` `must` The Eval Dashboard shall list the most recent suite runs across all agents, newest first, each row showing agent name, ran-at time, version, status, recall, precision, citation accuracy and cases passed / total.
- **AC-25** `[client]` `must` WHEN the user clicks an agent row on the Eval Dashboard, the client shall open that agent's eval page (AC-19).

Managing cases (D-3, D-10)

- **AC-26** `[server, client]` `must` WHEN the user saves the "New eval case" form with a name, a unified-diff fragment (with file headers) and an expected output, the API (`POST /agents/:id/eval-cases`, body `EvalCaseInput` with `input_diff` and `expected_output`) shall store the case in that agent's eval set.
- **AC-27** `[server, client]` `must` WHEN the user saves the case modal of an existing case, the API (`PUT /eval-cases/:id`) shall update the case's name and expected output and leave its diff unchanged.
- **AC-28** `[client]` `must` The case modal shall show the case's diff read-only, its expected output as editable JSON with a valid/invalid indicator, and its latest case result with pass/fail, expected and produced finding counts, duration and cost.
- **AC-29** `[server, client]` `must` WHEN the user confirms the deletion of a case, the API (`DELETE /eval-cases/:id`) shall remove the case from the eval set.
- **AC-30** `[client]` `must` WHEN the user clicks a case's delete control, the Evals tab shall ask for confirmation naming the case before deleting it.
- **AC-31** `[server]` `must` WHEN a case is deleted or edited, the API shall keep every earlier suite run's metrics and case results unchanged, each case result still showing the case name and expectation it was scored against.

Asynchronous and additional runs (D-3, D-8, D-14)

- **AC-32** `[server]` `must` WHEN `POST /agents/:id/eval-runs` is accepted, the API shall respond 202 with the suite run's id and status `running` before any case is reviewed.
- **AC-33** `[server, client]` `must` WHILE a suite run of an agent has status `running` in `GET /agents/:id/eval-runs`, the Evals tab and the per-agent eval page shall show it as running and disable their run buttons for that agent.
- **AC-34** `[server, client]` `must` WHEN the user clicks a case's run control, the API (`POST /eval-cases/:id/run`) shall review that one case with the inputs of AC-10, store a case result scored as in AC-13 to AC-17, and the case row shall show the new result without creating a suite run or changing any suite run's metrics.
- **AC-35** `[server, client]` `must` WHEN the user clicks "Run all agents" on the Eval Dashboard, the client shall call `POST /agents/:id/eval-runs` for every agent with at least one eval case and show each agent's row as running until its run ends.

Trends, filter and promote (D-3, D-12, D-13, D-17, D-18)

- **AC-36** `[server, client]` `must` WHEN the latest `done` suite run has any of recall, precision or citation accuracy at least 1 percentage point lower than the previous `done` suite run, the per-agent eval page shall show a warning banner naming each dropped metric, the drop in points and the version.
- **AC-37** `[server, client]` `must` The per-agent eval page shall show a trend chart of recall, precision and citation accuracy with one point per `done` suite run in the selected period (`EvalDashboard.trend`).
- **AC-38** `[client]` `must` The metric tiles of the per-agent eval page and each agent row of the Eval Dashboard shall show a sparkline of that agent's metric over its `done` suite runs.
- **AC-39** `[server, client]` `must` WHEN the user picks 7 days, 30 days, 90 days or all time in the period filter of the per-agent eval page, the run list and trend chart shall show only suite runs started within that period, with 30 days selected when the page opens.
- **AC-40** `[server, client]` `must` WHEN the user clicks "Promote vN" in the compare view, the API (`POST /agents/:id/versions/:version/promote`) shall copy version N's saved configuration (provider, model, system prompt, strategy, and skill links in order) into the agent as a new version, so `GET /agents/:id` returns that configuration with a version number one higher than the agent's latest version.
- **AC-41** `[server]` `must` WHEN a version is promoted, the API shall leave every existing version snapshot and every stored suite run unchanged.
- **AC-42** `[client]` `must` The per-agent eval page shall have its own URL `/eval/<agentId>` that opens it directly for that agent, and the Evals tab's "View full dashboard" link shall open that URL.

Finding card after a decision (D-4, revised 2026-10-08)

- **AC-43** `[client]` `must` WHEN the user accepts or dismisses a finding, the finding card shall change only by showing the decision (the "accepted" or "rejected" tag next to the title and the active state of the Accept or Reject button), and shall not dim the card or strike through its title.

## Edge cases

- **EC-1** `[client]` `must` WHILE a finding is neither accepted nor dismissed, the finding card shall show no "Turn into eval case" button; once the finding is accepted or dismissed, one click on the button creates the case with the type derived from the decision (AC-1, AC-2), with no type picker.
- **EC-2** `[server, client]` `must` IF an eval case already exists for the same source finding, THEN the API shall return the existing case without creating a second one and the finding card shall show it as already an eval case.
- **EC-3** `[server, client]` `must` IF the finding's review has no producing agent (as for the seeded demo review), THEN the API shall reject the request with a 409 naming the reason, and the finding card shall show that reason.
- **EC-4** `[server, client]` `must` IF no stored patch exists for the finding's file in the review's PR (as for the seeded demo PR's files), THEN the API shall reject the request with a 409 "no diff available for <file>", store nothing, and the finding card shall show that reason.
- **EC-5** `[server, client]` `must` IF the agent's eval set is empty, THEN the Evals tab shall disable "Run all evals" and show an empty state, and `POST /agents/:id/eval-runs` shall return a 409 without a model call.
- **EC-6** `[server, client]` `must` IF a suite run produces zero grounded findings, THEN the API shall store precision as null and the UI shall show "—", never 0 % or 100 %; the same holds for recall when the run has no `must_find` case and for citation accuracy when the model returned no finding.
- **EC-7** `[server, client]` `must` IF the model call fails for any case of a suite run, THEN the API shall mark the suite run `failed` with the failing case and reason, store null metrics for it, and the run list shall show it as failed rather than as low scores.
- **EC-8** `[server]` `must` IF `POST /agents/:id/eval-runs` or `POST /eval-cases/:id/run` arrives while a suite run of the same agent has status `running`, THEN the API shall reject it with a 409 and keep the running one, including when two run requests arrive at the same moment (exactly one gets 202).
- **EC-9** `[server]` `must` WHEN the agent emits a finding in a different file from a `must_not_flag` expectation, the scorer shall not count it as noise for that expectation (AC-13 requires an equal file).
- **EC-10** `[server]` `must` WHEN the agent is edited or a version is promoted while a suite run is in progress, the API shall finish the run with the configuration it started with and record that version and effective prompt.
- **EC-11** `[server]` `must` WHEN "Turn into eval case" (`POST /findings/:id/eval-case`) is requested for an accepted or dismissed finding that already has an eval case, the API shall set that case's expectation kind to the finding's current decision (`must_find` for accepted, `must_not_flag` for dismissed), keep its file and lines, and return it as the existing case (EC-2, `created: false`) with the updated kind; for an undecided finding it shall return the existing case unchanged, and earlier suite runs keep the expectation they were scored against (AC-31).
- **EC-12** `[server, client]` `must` IF the cost of any case review in a suite run is unknown, THEN the API shall store the suite run's cost as null and the run list, compare view and case modal shall show "—", never "$0.00".
- **EC-13** `[client]` `must` WHEN the two compared runs have identical effective prompts, the compare view shall state that the prompt did not change instead of an empty diff.
- **EC-14** `[server]` `must` The API shall return eval cases by creation time and suite runs newest first, in an order that does not change when a row is edited.
- **EC-15** `[server]` `must` IF a request for a finding that is neither accepted nor dismissed carries no `kind`, THEN the API shall reject it with a 422 `validation_error` and store nothing; for an accepted or dismissed finding the API shall use the kind derived from the decision.
- **EC-16** `[client]` `must` WHILE version N is the agent's latest version, the compare view shall disable "Promote vN" and say that vN is already the current version.
- **EC-17** `[server]` `must` WHEN the API starts, it shall mark every suite run still in status `running` as `failed` with reason "interrupted", so the agent can be run again.
- **EC-18** `[server]` `must` IF a manual case's `input_diff` contains no parseable file hunk, or a `must_find` expectation's file and lines do not intersect the diff's hunk lines (the line index the grounding gate uses), THEN the API shall reject the case with a 422 `validation_error` naming the problem.
- **EC-19** `[client]` `must` WHEN "Run all agents" meets an agent whose run is rejected with a 409, the Eval Dashboard shall show that agent as "already running" and start the others.
- **EC-20** `[client]` `must` IF the expected-output JSON in the case modal does not parse, THEN the modal shall mark it invalid and disable "Save".
- **EC-21** `[server]` `must` IF the finding's review names an agent that no longer exists, THEN the API shall reject the request with a 409 "agent no longer exists"; IF the finding or the agent belongs to another workspace, THEN it shall respond 404.
- **EC-22** `[server, client]` `must` IF the finding's lines do not intersect the hunk lines of the stored patch for its file (the PR was re-synced after the review), THEN the API shall reject the request with a 409 saying the diff changed since the review, store nothing, and the finding card shall show that reason.
- **EC-23** `[server]` `must` IF the review's PR has more than one stored file row for the finding's path, THEN the API shall use a row whose patch's hunk lines intersect the finding's lines, choosing the same row on every request for the same finding.
- **EC-24** `[server, client]` `must` WHEN the source finding or its review is deleted after an eval case was made from it, the case shall stay in the eval set, keep running and scoring, and show no link to a source finding.
- **EC-25** `[server, client]` `must` IF version N has no saved configuration snapshot (as for the seeded agents), THEN the compare view shall disable "Promote vN" with that reason and the promote route shall reject the request with a 409.
- **EC-26** `[server, client]` `must` WHEN an agent is deleted, the Eval Dashboard shall stop listing it in the agent rows and the recent runs.
- **EC-27** `[server]` `must` WHEN a case is edited or deleted while a suite run is running, the run shall score that case with the inputs and expectation it had when the run started.

## Non-functional requirements

- **NFR-1** `[server]` `must` The scorer shall make zero LLM calls: a suite run over N cases shall call the model provider only for the N case reviews (plus the engine's own structured-output retries), and scoring a stored run again shall call it zero times.
- **NFR-2** `[server]` `must` The API shall send each case's `input_diff` to the model through the same untrusted-content wrapping and injection guard as a normal PR review.
- **NFR-3** `[server]` `must` WHEN a suite run ends, the API shall log the agent id, the version, the case count, the cases passed, the duration and, on failure, the failing case and reason.
- **NFR-4** `[server]` `should` The API shall rate-limit `POST /agents/:id/eval-runs` and `POST /eval-cases/:id/run` at least as tightly as `POST /pulls/:id/review`, because each call spends model calls.
- **NFR-5** `[client]` `must` The per-agent eval page shall let the user select two runs and open, read and close the compare view with the keyboard alone, with visible focus on each control.
- **NFR-6** `[client]` `must` Every colour signal in this feature (case pass/fail, metric deltas, the regression banner, running and failed states) shall have a text or icon twin: pass/fail shows a word or icon with an accessible name, and each delta shows an arrow and a sign.
- **NFR-7** `[client]` `must` WHILE a suite run is running, the Evals tab and the per-agent eval page shall reflect its status change within 5 seconds of the API reporting it.
- **NFR-8** `[server]` `must` The API shall review each case at most once per suite run and never retry a suite run on its own, so one click spends at most one engine review per case.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| AC-13 | `must_find` case `src/config.ts` 12–12 (Stripe key) | agent emits a grounded finding at `src/config.ts` 11–13 | match; case passes |
| AC-13 | `must_find` case `src/config.ts` 12–12 | agent emits one grounded finding at `src/config.ts` 14–14 | no match; case fails |
| AC-15 | case A `must_find` `src/config.ts` 12–12; case B `must_not_flag` `src/api/users.ts` 40–44; case C `must_not_flag` `src/api/public/webhooks.ts` 61–74 | agent emits A: `src/config.ts` 12 and `src/config.ts` 3 (unlabelled); B: `src/api/users.ts` 42; C: nothing (all grounded) | recall 1/1 = 1.00; precision 2/3 = 0.67 (`users.ts` 42 is noise; `config.ts` 3 is not, D-9); passed 2/3 |
| EC-9 | case B `must_not_flag` `src/api/users.ts` 40–44 with a diff covering only that file | the model also emits `src/middleware/ratelimit.ts` 52 | that finding is dropped by grounding (file not in the case diff, AC-10), counts in citation accuracy only, not as noise |
| AC-16 | the model returns 4 findings across the run; the grounding gate drops 1 (cited `src/config.ts` 90 outside every hunk) | the run is scored | citation accuracy 3/4 = 0.75 |
| EC-6 | 8 `must_not_flag` cases, a quiet prompt | agent emits no finding for any case | precision null → "—"; recall null → "—"; citation null → "—"; passed 8/8 |
| AC-3 | accepted finding `src/config.ts:12`; `pr_files.patch` for `src/config.ts` begins `@@ -10,6 +10,7 @@` | user clicks "Turn into eval case" | `input_diff` begins `diff --git a/src/config.ts b/src/config.ts`, `--- a/src/config.ts`, `+++ b/src/config.ts`, then the patch; parsing it yields `src/config.ts` with new-side lines 10–16 |
| EC-22 | finding `src/config.ts` 12–12 from a review; the PR was re-synced and the stored patch now has one hunk `@@ -30,4 +30,6 @@` | user clicks "Turn into eval case" | 409 "diff changed since the review"; no case stored |
| AC-40 | Security Reviewer has snapshots v6 and v7; latest is v8 (prompt edited after the v7 run) | user compares the v6 and v7 runs and clicks "Promote v7" | agent becomes v9 with v7's provider, model, system prompt, strategy and skill links; v6, v7, v8 snapshots unchanged |
| AC-36 | previous `done` run v6: recall 0.78, precision 0.93, citation 0.94; latest `done` run v7: 0.82, 0.91, 0.95 | the per-agent page loads | banner names precision, down 2 points, on v7; recall and citation are not named |

## Traceability and verification

| ID | Source | Verification hint |
|---|---|---|
| AC-1 | brief "From an accepted finding: must find X at file:line"; frame `finding-card-eval-action.png` | server `*.it.test.ts` on the route; client RTL test on FindingCard |
| AC-2 | brief "From a dismissed one: must NOT comment on Y" | server `*.it.test.ts` on the route |
| AC-3 | brief "saves the diff fragment plus the expectation"; investigator B-7 (`pr_files.patch` is headerless) | server `*.it.test.ts` (Examples row AC-3): re-sync `pr_files` after creation, case diff unchanged and parseable |
| AC-4 | frame `agent-editor-evals-tab.png` (severity · category label per case); D-5 | server `*.it.test.ts` |
| AC-5 | brief "accepted → must_find, dismissed → must_not_flag"; investigator B-1 (422 `validation_error`) | server `*.it.test.ts` with bad payloads |
| AC-6 | brief "in one click" | client RTL test |
| AC-7 | brief "See all cases in an agent's set"; frame `agent-editor-evals-tab.png` | client RTL test; server `*.it.test.ts` on the list route |
| AC-8 | frame `agent-editor-evals-tab.png` ("3 / 5 passing") | client RTL test |
| AC-9 | brief "POST /agents/:id/eval-runs runs the agent on every case in the set" | server `*.it.test.ts` with `MockLLMProvider` overriding `llm` and `openrouter` |
| AC-10 | brief "Inputs are fixed so runs of different agent versions are comparable"; investigator B-10, B-11 | server unit test: two runs capture identical engine inputs; an agent with `repo_intel` on and `context_paths` set sends neither |
| AC-11 | frames `agent-eval-page.png`, `eval-dashboard.png`; D-18; investigator B-3 | server `*.it.test.ts` |
| AC-12 | frames `agent-editor-evals-tab.png` ("Run all evals"), `agent-eval-page.png` ("Run eval"); D-8 | client RTL test |
| AC-13 | brief "same file and the line ranges overlap" | server unit test (Examples rows AC-13) |
| AC-14 | brief "recall = share of expected (must_find) items that were found" | server unit test (Examples row AC-15) |
| AC-15 | brief "precision = share of produced findings that are not noise"; D-9 | server unit test (Examples row AC-15) |
| AC-16 | brief "citation_accuracy = share of findings that survived the grounding gate"; investigator B-12 | server unit test (Examples row AC-16) |
| AC-17 | brief "both expectation types work"; frame `agent-editor-evals-tab.png` | server unit test |
| AC-18 | brief "See run metrics"; frames `agent-editor-evals-tab.png`, `agent-eval-page.png`; investigator B-16 | client RTL test; server `*.it.test.ts` on the dashboard payload |
| AC-19 | brief "Open the run history"; frame `agent-eval-page.png`; D-3 (cost column) | client RTL test |
| AC-20 | frame `agent-eval-page.png` (checkboxes, "2 selected", Compare) | client RTL test |
| AC-21 | brief "compare two runs side by side (old prompt vs new)"; frame `compare-runs-modal.png`; D-18 | client RTL test; manual against `compare-runs-modal.png` |
| AC-22 | brief "a separate Eval Dashboard page in the left sidebar"; frame `eval-dashboard.png`; investigator B-17 | client RTL test on the sidebar |
| AC-23 | brief "shows recently launched evals"; frame `eval-dashboard.png`; investigator B-16 | client RTL test; manual against `eval-dashboard.png` |
| AC-24 | frame `eval-dashboard.png` ("Recent eval runs · all agents"); investigator B-16 | client RTL test; server `*.it.test.ts` |
| AC-25 | frame `agent-eval-page.png` ("All agents" back link, breadcrumb) | client RTL test |
| AC-26 | D-3 (manual "New eval case": diff fragment plus expected output); frame `agent-editor-evals-tab.png` | server `*.it.test.ts`; client RTL test |
| AC-27 | D-3 (case edit: name and expected output); frame `eval-case-modal.png` | server `*.it.test.ts`; client RTL test |
| AC-28 | D-3; frame `eval-case-modal.png` (Diff tab, "valid JSON", "Last run passed") | client RTL test; manual against `eval-case-modal.png` |
| AC-29 | D-3 (case delete); frame `agent-editor-evals-tab.png` (trash icon) | server `*.it.test.ts`; client RTL test |
| AC-30 | D-10 (confirmation before deleting a case) | client RTL test |
| AC-31 | D-3 with AC-11; investigator B-3 (case results cascade on case delete today) | server `*.it.test.ts`: delete and edit a case, earlier runs unchanged |
| AC-32 | D-8 (async, run id at once); investigator B-5 | server `*.it.test.ts` with a slow mock provider |
| AC-33 | D-8 (UI shows "running") | client RTL test; server `*.it.test.ts` on the list status |
| AC-34 | D-3 (per-case run); frame `agent-editor-evals-tab.png` (play icon per case) | server `*.it.test.ts`; client RTL test |
| AC-35 | D-3 (Run all agents); frame `eval-dashboard.png` | client RTL test |
| AC-36 | D-3, D-12; frame `agent-eval-page.png` ("Precision dipped 2pts on v7") | client RTL test (Examples row AC-36) |
| AC-37 | D-3 (trend chart); frame `agent-eval-page.png` ("Metric trend") | client RTL test; manual against `agent-eval-page.png` |
| AC-38 | D-3 (sparklines); frames `eval-dashboard.png`, `agent-eval-page.png` | client RTL test; manual against `eval-dashboard.png` |
| AC-39 | D-3, D-13; frame `agent-eval-page.png` ("30 days") | client RTL test; server `*.it.test.ts` on the period query |
| AC-40 | D-17 (restore as new version); frame `compare-runs-modal.png` ("Promote v7") | server `*.it.test.ts` (Examples row AC-40); client RTL test |
| AC-41 | D-17 | server `*.it.test.ts` |
| AC-42 | D-10 (deep link); frame `agent-editor-evals-tab.png` ("View full dashboard →"); investigator B-17 | client RTL test |
| AC-43 | D-4 (revised 2026-10-08: a decision changes the card only by its tag and button state) | client RTL test |
| EC-1 | D-4 (revised 2026-10-08: no button on undecided findings, no type picker) | client RTL test |
| EC-2 | D-5 (one case per finding); investigator B-4 | server `*.it.test.ts` posting twice |
| EC-3 | D-6; `client/INSIGHTS.md` 2026-09-17 (seeded review has no run link); seed review has no `agent_id` | server `*.it.test.ts` on the seeded review |
| EC-4 | D-6; seeded `pr_files` rows have no `patch` | server `*.it.test.ts` |
| EC-5 | design-gap analysis (empty set) | client RTL test; server `*.it.test.ts` |
| EC-6 | brief "precision denominator 0"; `client/INSIGHTS.md` 2026-09-17 (null is not 0); investigator B-16 | server unit test (Examples row EC-6); client RTL test |
| EC-7 | brief "LLM failure mid-run"; D-7 | server `*.it.test.ts` with a failing mock provider on case 2 |
| EC-8 | brief "concurrent runs"; D-8; investigator B-5 (no per-agent guard exists) | server `*.it.test.ts` firing two requests in parallel |
| EC-9 | brief "a must_not_flag case where the agent emits a finding in another file"; investigator B-10 | server unit test (Examples row EC-9) |
| EC-10 | brief "Inputs are fixed"; D-18 | server `*.it.test.ts` editing the agent mid-run |
| EC-11 | D-5 (revised 2026-10-08: a repeat request re-syncs the kind to the current decision) | server `*.it.test.ts`: create from an accepted finding, dismiss it, post again → same case id, `created: false`, `must_not_flag`, file and lines unchanged, earlier run's case result still `must_find`; undecided finding → case unchanged |
| EC-12 | `client/INSIGHTS.md` 2026-09-17 (unknown cost renders "—"); `reviewer-core/INSIGHTS.md` 2026-09-16 (cost is all-or-nothing); investigator B-13 | server unit test; client RTL test |
| EC-13 | design-gap analysis (compare identical prompts); D-18 | client RTL test |
| EC-14 | `server/INSIGHTS.md` 2026-09-19 (list reorders after an UPDATE); investigator B-2 | server `*.it.test.ts` |
| EC-15 | D-4 (API unchanged by the 2026-10-08 revision; the UI no longer sends `kind`); investigator B-1 | server `*.it.test.ts` |
| EC-16 | D-17 ("already active" = vN is the latest version) | client RTL test |
| EC-17 | D-14; investigator B-5 (boot reaper) | server `*.it.test.ts` |
| EC-18 | D-11; investigator B-1 | server `*.it.test.ts` |
| EC-19 | D-3 (Run all agents) with D-8 (one run per agent) | client RTL test |
| EC-20 | frame `eval-case-modal.png` ("valid JSON" badge) | client RTL test |
| EC-21 | investigator B-6 (`reviews.agent_id` has no FK, may dangle) | server `*.it.test.ts` |
| EC-22 | investigator B-8 (re-sync rewrites `pr_files`; reviews have no head sha) | server `*.it.test.ts` (Examples row EC-22) |
| EC-23 | investigator B-9 (duplicate `pr_files` rows per path in the live DB) | server `*.it.test.ts` |
| EC-24 | investigator B-4 | server `*.it.test.ts` deleting the review |
| EC-25 | investigator B-18 (seeded agents have no `agent_versions` rows); D-17 | server `*.it.test.ts`; client RTL test |
| EC-26 | investigator B-6 (`eval_cases.owner_id` has no FK) | server `*.it.test.ts` |
| EC-27 | AC-10 fixed inputs with D-8 async runs | server `*.it.test.ts` with a slow mock provider |
| NFR-1 | brief "Scoring is pure code with NO LLM call"; course criterion "scoring makes zero LLM calls"; investigator B-14 | server unit test asserting `MockLLMProvider.calls` |
| NFR-2 | `reviewer-core/AGENTS.md` (INJECTION_GUARD, wrapUntrusted) | server unit test on the assembled prompt |
| NFR-3 | design-gap analysis (observability of a failed run) | server `*.it.test.ts` asserting the log line |
| NFR-4 | `server/AGENTS.md` (tighter caps on expensive routes); investigator B-15 | server `*.it.test.ts` built with `NODE_ENV=development` (the limiter is off under `test`) |
| NFR-5 | D-10 (keyboard-only Compare) | client RTL test with keyboard events; manual tab-through |
| NFR-6 | D-10 (text or arrow twin for every colour signal) | client RTL test on accessible names and delta arrows |
| NFR-7 | D-8; investigator B-5 (review pattern polls about every 4 s) | client RTL test with fake timers |
| NFR-8 | investigator B-5 (a job runner's retries would re-spend money) | server `*.it.test.ts` counting provider calls on a failed run |

## Decisions

- **D-1** File name: brief's `specs/eval-pipeline.md` or the repo convention? → keep `specs/spec-0003-eval-pipeline.md` (accepted).
- **D-2** `pnpm verify:l06` does not exist; spec it? → no; out of scope, no requirement (declined).
- **D-3** Design elements beyond the brief? → in scope: regression banner, trend chart and sparklines, cost column, case edit (name and expected output), case delete, Promote version, per-case run, manual "New eval case" (diff fragment plus expected output), Run all agents, 30-days filter. Out: Run on save toggle, Files / PR meta tabs, Finding skeleton button.
- **D-4** Undecided finding? → allow the button and ask the user to pick `must_find` or `must_not_flag`; accepted and dismissed findings still create a case in one click with the derived type. **Revised by the user on 2026-10-08** after reviewing the implementation in the browser: "Turn into eval case" appears only after the finding is accepted or dismissed, one click creates the case with the derived type, and there is no type picker (EC-1). Accepting or dismissing changes the card only by the decision tag and the active Accept / Reject button, with no dimming and no struck-through title (AC-43). The server API is unchanged: `POST /findings/:id/eval-case` still accepts an optional `kind` for an undecided finding (EC-15), but the UI no longer sends it.
- **D-5** Duplicates and later flips? → one case per finding (a second click returns the existing case); the case keeps its expectation if the decision flips. **Revised by the user on 2026-10-08** after testing in the browser: using "Turn into eval case" again on a decided finding that already has a case updates the case's expectation kind to the finding's current decision (dismissed → `must_not_flag`, accepted → `must_find`), keeping file and lines, and returns the existing case with `created: false` (EC-2, EC-11); an undecided finding gets the existing case unchanged; earlier runs keep the expectation they were scored against (AC-31). One case per finding still holds.
- **D-6** Finding with no agent or no patch? → reject with a reason; no seeding (declined fallbacks and seeding).
- **D-7** Model failure mid-run? → the whole run fails with no metrics (declined partial scoring).
- **D-8** Execution? → async: `POST` returns a run id at once, the UI shows "running", one run per agent at a time.
- **D-9** Is an unlabelled finding inside a `must_find` case noise? → no (declined).
- **D-10** UX and accessibility proposals? → accept all four: keyboard-only Compare, a text or arrow twin for every colour signal, a deep link to an agent's eval page, confirmation before deleting a case.
- **D-11** Manual case validation? → reject a diff with no parseable hunk and a `must_find` outside the diff's hunks, with the app's validation status (422).
- **D-12** Regression banner threshold? → a drop of at least 1 percentage point in any metric versus the previous run.
- **D-13** Period filter options? → 7d / 30d / 90d / all, default 30d.
- **D-14** Run left `running` by a restart? → at API boot, mark it failed with "interrupted".
- **D-15** Agent switcher on the per-agent eval page? → out of scope (declined).
- **D-16** How is the ≥8-case set reached? → no seeding and no change to the data source; the user runs more real reviews and decides findings before the demo; undecided findings (D-4; through the API only since its 2026-10-08 revision) and manual cases count too. The live DB today has at most 6 eligible decided findings for one agent and 1 accepted finding overall, so this is a demo precondition, not a feature guarantee.
- **D-17** What does Promote do? → restore as new version: copy vN's saved configuration into the live agent, creating a new latest version (as the skills Versions tab's restore does); no active-version pointer. "Already active" means vN is the latest version.
- **D-18** What does Compare diff? → each suite run saves the full effective prompt it used (system prompt plus resolved skill bodies), model and provider; Compare diffs those, never `agent_versions` alone.

## Inputs and provenance

Data read:
- `findings` (file, start/end line, title, severity, category, `accepted_at` / `dismissed_at`; accept and dismiss are mutually exclusive and there is no route to clear both) → `reviews.agent_id` (nullable, no foreign key, may name a deleted agent) → `reviews.pr_id` → `pr_files` (`path`, `patch`). `pr_files.patch` is headerless (starts at `@@`); there is no unique `(pr_id, path)` and duplicates exist in the live DB; a PR re-sync rewrites the rows, and reviews carry no head sha.
- The seeded demo review has no agent and the seeded `pr_files` have no patch (EC-3, EC-4). Seeded agents (Performance, Security, Test Quality) have no `agent_versions` rows (EC-25).
- `agents` (live config, `version`) and `agent_versions.config_json` (provider, model, system prompt, output schema, strategy, ci fail-on, repo-intel flag, enabled skill ids). A name or description change bumps the version without a snapshot. Skill-body edits do not bump the agent version, which is why runs save their effective prompt (D-18).
- Review engine (`reviewer-core`): grounded findings (`review.findings`) and the `dropped` list per review, token usage and cost (null when unknown). Model output is external and untrusted, and not deterministic.
- User input: manual case name, diff fragment and expected output; the expectation kind for undecided findings (accepted by the API, no longer sent by the UI since the D-4 revision).

Constraints the plan must meet (storage and contracts; the plan chooses how):
- Build on `eval_cases` / `eval_runs` and the existing contracts rather than a parallel schema. Today `eval_runs` is one row per case execution with no suite grouping, agent, version, status, error or workspace, and its `case_id` cascades on case delete. The spec needs a suite-level run (status `running|done|failed`, nullable metrics, cases passed / total, nullable cost, error and failing case, agent version, saved effective prompt, model, provider), with per-case results linked to it. Each result keeps the case name and expectation it was scored against, its grounded findings, and its kept / dropped counts, and survives case deletion (AC-31).
- `eval_cases` needs a creation time (EC-14) and a nullable source-finding link that survives the finding's deletion (EC-2, EC-24).
- One running suite run per agent must be enforced by the database, not by check-then-insert (EC-8). Runs follow the PR-review pattern: insert a `running` row, review in the background, the client polls, and a boot reaper handles leftovers (EC-17). They do not use the job runner, whose timeout and retries would re-spend money (NFR-8).
- Contracts: `EvalDashboard.current` / `delta` and the `EvalRun` metrics become nullable (EC-6, EC-7). AC-23 needs per-agent rows and AC-24 a suite-level recent list (today's `recent_runs` is case-level). `EvalCase.input_diff` is non-null in the contract but nullable in the DB. Every new field lands in both `@devdigest/shared` copies. The client copy also lacks `AgentVersion` / `AgentVersionConfig` and the `openrouter` provider value.
- Validation failures use the app's 422 `validation_error`; conflicts use 409.
- The sidebar item (AC-22) requires a deliberate edit to the vendored UI navigation (`client/src/vendor/ui`), an exception to its do-not-touch note; the `/eval` active-key mapping already exists. `editor.tabs.evals` and `messages/en/eval.json` already exist. `Sparkline`, `LineChart` and `MetricCard` exist in the UI library; the text diff used by the skills Versions tab is local to it today.

Design vs code vs brief:
- The design's finding card shows "Learn" and "Reply to author"; the real card has only Accept and Dismiss, so only "Turn into eval case" is added (non-goal).
- The design shows "v6 → v7" prompt diffs from versions; Compare diffs the runs' saved effective prompts instead (D-18), which also works for seeded agents without snapshots.
- The brief's file name, `pnpm verify:l06` and "≥8 cases" were settled by D-1, D-2 and D-16.

## Untrusted inputs

- `input_diff` (PR diff text from `pr_files`, or a fragment pasted by the user): stored as data, sent to the model only inside the untrusted wrapper (NFR-2), rendered escaped as text in the case modal, never executed or interpolated into SQL or shell. It may contain secrets already in the PR (the design frame shows a live-looking Stripe key); the API must not log diff contents or saved prompts.
- Finding `title`, `rationale`, `category` (LLM output), grounded findings stored with case results, and case names typed by the user or derived from findings: rendered escaped.
- `expected_output` JSON from the API body: validated against the expectation contract (AC-5, EC-18), never evaluated.
- Saved effective prompts (agent prompt and skill bodies, which may come from imported URLs): rendered as plain text in the compare diff.
- Route params `:id`, `:version` and selected run ids: validated (uuid, positive integer) and scoped to the caller's workspace (EC-21); a promote of a version the agent does not have returns 404.

## Open questions

None.
