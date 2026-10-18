# Spec: Multi-Agent Review

Spec ID: SPEC-0004
Status: approved
Supersedes: —
Modules: client (owner), server, mcp
Design: specs/images/spec-0004/empty-no-agents.png, specs/images/spec-0004/configure-run.png, specs/images/spec-0004/configure-run-no-pr.png, specs/images/spec-0004/results-columns.png, specs/images/spec-0004/results-tabs-detail.png, specs/images/spec-0004/results-tabs-detail-alt.png, specs/images/spec-0004/pr-page-agent-picker.png

## Problem and user

A DevDigest user can run review agents on a PR one at a time, or "all
enabled" at once, but the results land as separate runs in the PR's run
history. Nothing ties them together as one review. To compare what a
security, a performance and a mentoring agent each said about the same PR,
the user has to open each run and line up file:line references in their
head. They cannot see where agents agree, where only one agent raised
something, or what a run with several agents costs next to a run with one.

## Goals / Non-goals

Goals:
- Pick a PR and a subset of agents, see each agent's estimated time and cost,
  and start all of them with one action, from the Multi-Agent Review page or
  from the PR page.
- Group the selected agents' runs under one multi-agent run that can be
  reopened by URL.
- Show the results side by side (Columns) or one agent at a time (Tabs), with
  live per-agent status and per-agent logs/trace.
- Group findings by code location without losing any original finding or its
  author, and show where agents disagree.
- Let the user measure one agent against three on the same PR by hand
  (D-5), using the wall-clock time and cost the results page shows.

Non-goals:
- Text or embedding similarity in grouping. Grouping uses file and lines only (D-7).
- Persisting groups or disagreements. They are computed on every read (D-6, D-7).
- An LLM-written reason in a "did not flag" cell (D-4).
- Showing agents that were not part of the run in the disagreement block (D-4).
- "Reply to author" on a finding. It does not exist in the app today (D-11).
- A history list of past multi-agent runs, or a PR-page link to the latest one (D-12, D-17).
- "Learn" on a finding (declined by user, D-16).
- Clicking a finding in Columns mode to jump to its Tabs card (declined by user, D-24).
- Cancelling a whole multi-agent run from the results page. The design has no control for it.
- Anything under `server/src/modules/ci` or `agent-runner/` (brief boundary).
- Any `mcp` change beyond the `run_agent_on_pr` request body (D-30). No new MCP tool.
- Running the 1-vs-3 measurement as an automated test (D-5).

## User stories

- As a reviewer, I want to run three chosen agents on PR #482 at once and
  read their findings side by side, so that I can see which concerns several
  agents share and which only one agent raised.
- As the person paying for model calls, I want an estimate before I start
  and the real time and cost after, so that I can decide whether more agents
  are worth it.

## Acceptance criteria (EARS)

Starting a run (server):

- **AC-1** `[server]` `must` WHEN `POST /pulls/:id/review` receives `{agentIds}` with two or more agent ids of the caller's workspace, the API shall create one `multi_agent_runs` row for that PR and one `agent_runs` row per listed agent whose `multi_agent_run_id` points at that row (D-30).
- **AC-2** `[server, client]` `must` WHEN a multi-agent run is created, the `POST /pulls/:id/review` response shall carry `multi_agent_run_id` next to the existing `runs[]` entries (`run_id`, `agent_id`, `agent_name`).
- **AC-3** `[server]` `must` WHEN a multi-agent run starts, the API shall load the PR diff and derive the PR intent once for the whole run, not once per agent.
- **AC-4** `[server]` `must` IF one agent's run in a multi-agent run fails, THEN the API shall still finish every other agent's run and store each run's own status and error.
- **AC-5** `[server]` `must` WHILE a multi-agent run is in progress, the API shall run its agents concurrently, so that more than one of its child runs has status `running` at the same time, while still preparing diff and intent once (AC-3) and isolating each agent's failure (AC-4) (D-15).
- **AC-6** `[server]` `must` WHEN `POST /pulls/:id/review` receives `{agentIds}` with exactly one agent id, the API shall run today's single-agent review: one `agent_runs` row with `multi_agent_run_id` NULL, no `multi_agent_runs` row, and no `multi_agent_run_id` in the response (D-30).

Reading a run and grouping (server):

- **AC-7** `[server, client]` `must` WHEN the client requests `GET /multi-runs/:id`, the API shall return the parent run (id, PR id, PR number, PR title, `ran_at`), every child run in the existing run-summary shape (agent id and name, status, error, score, `duration_ms`, `cost_usd`, tokens), every child run's review summary and findings in the existing finding shape, and the computed groups.
- **AC-8** `[server]` `must` The API shall put two findings of one multi-agent run in the same group WHEN their file paths are equal and their line ranges overlap or are at most 3 lines apart, and shall join such pairs transitively (D-22). The Examples table shows the exact rules.
- **AC-9** `[server]` `must` Each group in the `GET /multi-runs/:id` response shall list every member finding unchanged, by finding id, with the agent that produced it, so that no finding is dropped, merged or edited.
- **AC-10** `[server]` `must` The API shall mark a group as a conflict WHEN at least one participating agent whose run is `done` has no finding in it, or WHEN its member findings carry different severities.
- **AC-11** `[server, client]` `must` WHEN the client requests per-agent estimates (`GET /agents/run-estimates`), the API shall return for each agent of the workspace the average `duration_ms` and the average known `cost_usd` of its last 10 `done` runs on any PR, with `null` for a value that has no data.

Multi-Agent Review page and Configure run (client):

- **AC-12** `[client]` `must` The sidebar shall show a "Multi-Agent Review" entry under a GLOBAL section that opens the Multi-Agent Review page, which shows the "No agents selected" empty state and a "Configure run" button (`empty-no-agents.png`).
- **AC-13** `[client]` `must` WHILE no PR is selected on Configure run, the page shall show "Pick a pull request first" in place of the agent list (`configure-run-no-pr.png`) and the "Run multi-agent review" button shall be disabled.
- **AC-14** `[client]` `must` WHEN a PR is selected on Configure run, the page shall list every agent of the workspace as a card with a checkbox, its icon, its name, its estimate (AC-15) and a summary line, plus a "Select all" control that checks every card (`configure-run.png`). AC-36 defines the summary line and AC-37 the initial selection.
- **AC-15** `[client]` `must` Each agent card shall show its estimate as `<avg duration>s · $<avg cost>` from `GET /agents/run-estimates`, and "—" for a value that is `null`.
- **AC-16** `[client]` `must` The Configure run footer shall show "Run multi-agent review (N)", where N is the number of checked agents, and "≈ <max of the checked agents' known avg durations> · <sum of their known avg costs> · parallel fan-out".
- **AC-17** `[client, server]` `must` WHEN the user clicks "Run multi-agent review (N)", the client shall send one `POST /pulls/:id/review` with `agentIds` set to the checked agents and shall open the results page of the returned `multi_agent_run_id`.

PR page (client):

- **AC-18** `[client]` `must` WHEN the user opens "Run Review" on the PR page, the dropdown shall show "PICK AGENTS TO RUN" with one checkbox row per agent with its "~Ns" duration estimate, a "Clear" control, a "Run multi-agent review (N)" button and a "Configure agents…" link to the agents page (`pr-page-agent-picker.png`).
- **AC-19** `[client, server]` `must` WHEN the user runs two or more checked agents from the PR page dropdown, the client shall send one `POST /pulls/:id/review` with `agentIds` and open the results page of the returned `multi_agent_run_id` (D-29). AC-38 covers exactly one checked agent.

Results page (client):

- **AC-20** `[client]` `must` The results page shall be addressable by its multi-agent run id, so that reloading or pasting its URL shows the same run.
- **AC-21** `[client]` `must` The results page header shall show "Multi-Agent Review", "N selected agents · parallel", the PR number and title, a "Configure run" button, a Columns/Tabs toggle that starts on Columns, and "N agents · parallel · <wall-clock duration> total · <sum of known child costs>", where the wall-clock duration runs from the parent's start to the last child run's end (D-26, D-27).
- **AC-22** `[client]` `must` WHILE Columns mode is selected, the results page shall show one column per child run with the agent's icon and name, `duration · cost`, a score ring holding `agent_runs.score`, the agent's findings (severity icon, title, file:line), a "View trace" button and "N findings" (`results-columns.png`).
- **AC-23** `[client]` `must` WHILE a child run is `running`, its column shall show that run's live status from the existing per-run event stream (`GET /runs/:id/events`) in place of its findings.
- **AC-24** `[client]` `must` WHEN a child run's event stream ends, the results page shall refetch `GET /multi-runs/:id` and show that run's findings, score and the updated groups without a page reload.
- **AC-25** `[client]` `must` IF a child run is `failed` or `cancelled`, THEN its column and its tab shall show that status and the stored error, no score ring, and "—" for unknown cost.
- **AC-26** `[client]` `must` WHILE Tabs mode is selected, the results page shall show one tab per agent with its name and score, and the selected tab shall show a summary card (score ring, review summary, "View trace", `duration · cost`) above that agent's findings as the existing expandable finding cards with category, file:line, confidence, body, suggested fix, Accept, Dismiss and Turn into eval case (`results-tabs-detail.png`, `results-tabs-detail-alt.png`).
- **AC-27** `[client, server]` `must` WHEN the user accepts or dismisses a finding on the results page, the client shall call the existing `POST /findings/:id/accept` or `POST /findings/:id/dismiss` for that one finding, and other agents' findings in the same group shall keep their state.

Per-agent logs and trace (client):

- **AC-28** `[client]` `must` WHEN the user clicks "View trace" in a column or on a tab's summary card, the results page shall open the existing run trace drawer for exactly that agent's run id.
- **AC-29** `[client]` `must` WHILE that agent's run is in progress, the drawer shall show its live log, as the drawer does on the PR page today.
- **AC-30** `[client]` `must` WHEN that agent's run has completed, the drawer shall show the same sections as on the PR page (live log, Configuration, Stats, Prompt assembly, Copy raw output and the rest).
- **AC-31** `[client]` `must` IF that agent's run failed, THEN the drawer shall still open and show the run's error.
- **AC-32** `[client]` `must` The run trace drawer shall behave on the PR page exactly as it does today, while also opening from the results page.

Where agents disagree (client):

- **AC-33** `[client]` `must` The results page shall show a "WHERE AGENTS DISAGREE" block under both Columns and Tabs, with one row per group showing its file:line and title, and one cell per agent that took part in the run. AC-39 defines the row title and line.
- **AC-34** `[client]` `must` In a disagreement row, the cell of an agent with a member finding shall show that finding's severity label and title, and the cell of a participating agent whose run is `done` with no member finding shall show "did not flag" with no further text.
- **AC-35** `[client]` `must` WHILE "Show only conflicts" is off (its initial state), the block shall list every group, and WHILE it is on, the block shall list only groups marked as a conflict, without a new request.

Details settled by the user (D-18, D-21, D-28, D-29):

- **AC-36** `[client]` `must` The summary line of an agent card on Configure run shall be that agent's latest stored review summary on the selected PR, or the agent's description when it has none (D-28).
- **AC-37** `[client]` `must` WHEN Configure run gets a PR selected or the PR page "Run Review" dropdown opens, every enabled agent shall start checked and every disabled agent unchecked (D-18).
- **AC-38** `[client, server]` `must` WHEN the user runs exactly one checked agent from the PR page dropdown, the client shall send `POST /pulls/:id/review` with `{agentIds: [<that agent's id>]}` (a single-agent run, AC-6) and stay on the PR page (D-29, D-30).
- **AC-39** `[client]` `must` A disagreement row shall take its title from the group's highest-severity member finding and its line from the group's smallest start line, and a severity tie shall go to the agent selected first (D-21).

One-field run contract (D-30):

- **AC-40** `[mcp]` `must` WHEN the `run_agent_on_pr` tool starts a review, it shall send `POST /pulls/:id/review` with `{agentIds: [<resolved agent id>]}`, and its tool name, arguments and output shall stay unchanged.
- **AC-41** `[client]` `must` The PR page "Run Review" dropdown shall have no separate "Run all enabled agents" item. Running all enabled agents means running the default checked set (AC-37), which the dropdown sends as `agentIds` (D-30).

## Edge cases

- **EC-1** `[server]` `must` IF `agentIds` is missing or an empty array, THEN `POST /pulls/:id/review` shall return 400 `invalid_run_request` and create no rows (D-30).
- **EC-2** `[server]` `must` IF any id in `agentIds` is not an agent of the caller's workspace, THEN `POST /pulls/:id/review` shall return 404 and create no `multi_agent_runs` row and no `agent_runs` row.
- **EC-3** `[server]` `must` IF a body carries the removed `agentId` or `all` field, with or without `agentIds`, THEN `POST /pulls/:id/review` shall return a 400 validation error and create no rows (D-30).
- **EC-4** `[server]` `must` IF `agentIds` lists the same id twice, THEN `POST /pulls/:id/review` shall return 400 `invalid_run_request` and create no rows (D-23).
- **EC-5** `[server]` `must` IF loading the PR diff fails, THEN the API shall mark every child run of the multi-agent run `failed` with the reason, and the results page shall show every column failed (AC-25).
- **EC-6** `[server]` `must` IF `GET /multi-runs/:id` names a run that does not exist or belongs to another workspace, THEN the API shall return 404.
- **EC-7** `[client]` `must` WHEN the results page is reopened or reloaded while child runs are still `running`, each running column shall reconnect to its run's event stream and show the events so far (replay), and finished columns shall show their findings.
- **EC-8** `[server]` `must` IF a finding has no end line, THEN the API shall treat its range as its start line alone when grouping.
- **EC-9** `[client]` `must` IF a participating agent's run is `running`, `failed` or `cancelled`, THEN its disagreement cell shall show that status instead of "did not flag", and that agent shall not make a group a conflict (D-19).
- **EC-10** `[client]` `must` WHILE fewer than two child runs of the multi-agent run are `done`, the disagreement block shall show "Run two or more agents to compare" in place of rows (D-20).
- **EC-11** `[client]` `must` IF a child run is `done` with zero findings, THEN its column shall show "0 findings" and a "No findings" message that looks different from a failed run.
- **EC-12** `[client]` `must` IF no agent is checked on Configure run or in the PR dropdown, THEN "Run multi-agent review" shall be disabled and Configure run shall show "Pick at least one agent" (`empty-no-agents.png`).
- **EC-13** `[client]` `must` IF the workspace has no agents, THEN Configure run and the PR dropdown shall show "No agents yet — create one" linking to the agents page.
- **EC-14** `[client]` `must` WHEN "View trace" is opened in the moment between a run turning `done` and its trace being stored, the drawer shall show a loading state rather than "not found", and show the trace once it exists.

## Non-functional requirements

- **NFR-1** `[server]` `must` `GET /multi-runs/:id`, `GET /agents/run-estimates` and the grouping shall make no model call.
- **NFR-2** `[server]` `must` The API shall return the same groups, conflict flags and member order for the same set of findings, whatever order the findings are read in.
- **NFR-3** `[client]` `must` The results page, the Configure run estimates and the PR dropdown estimates shall render an unknown cost or duration as "—", never as "$0.00" or "0s".
- **NFR-4** `[server]` `must` The API shall resolve `agentIds`, the multi-agent run and its child runs only within the caller's workspace.
- **NFR-5** `[server]` `must` A multi-agent run shall count as one request against the existing 10-per-minute limit on `POST /pulls/:id/review`.
- **NFR-6** `[client]` `must` Every new piece of UI text on the Multi-Agent Review pages and in the PR dropdown shall come from the next-intl message files, with no hardcoded English.

## Examples

Grouping (AC-8, EC-8). Findings come from one multi-agent run whose agents
were Security, Performance and Customer-Facing, all `done`. Line ranges are
`start–end`.

| ID | Given | When | Then |
|---|---|---|---|
| AC-8 | Security: `src/middleware/ratelimit.ts:52` "Retry-After header omitted on 429" WARNING; Customer-Facing: `src/middleware/ratelimit.ts:52` "Retry-After header omitted on 429" WARNING and `src/middleware/ratelimit.ts:52` "429 body has no machine-readable error code" WARNING | groups are computed | one group with 3 members (1 Security, 2 Customer-Facing) |
| AC-8 | `src/middleware/ratelimit.ts:10–12` and `src/middleware/ratelimit.ts:15` | groups are computed | one group (gap 15 − 12 = 3) |
| AC-8 | `src/middleware/ratelimit.ts:10–12` and `src/middleware/ratelimit.ts:16` | groups are computed | two groups (gap 4) |
| AC-8 | `src/api/users.ts:10`, `src/api/users.ts:13`, `src/api/users.ts:16` from three agents | groups are computed | one group of 3 (10↔13 and 13↔16 join transitively, although 10 and 16 are 6 apart) |
| AC-8 | Performance: `src/middleware/ratelimit.ts:27` "Pipeline INCR+EXPIRE into one round-trip"; Junior Mentor: `src/middleware/ratelimit.ts:28` "Extract magic number 3600" | groups are computed | one group, although the topics differ. This is the cost of file+line grouping without text similarity (D-7) |
| AC-8 | `src/config.ts:12` and `src/Config.ts:12` | groups are computed | two groups (paths compared exactly) |
| EC-8 | `src/config.ts` start 12, no end line; `src/config.ts:14–20` | groups are computed | one group (gap 14 − 12 = 2) |
| AC-10 | the 3-member group from row 1 above; Performance `done` with no finding in it | conflicts are computed | conflict: Performance did not flag |
| AC-10 | Security `src/config.ts:12` CRITICAL and Performance `src/config.ts:12` WARNING; Customer-Facing also flags `src/config.ts:12` CRITICAL | conflicts are computed | conflict: severities differ |
| AC-10 | all three agents flag `src/config.ts:12` as CRITICAL | conflicts are computed | not a conflict; hidden when "Show only conflicts" is on |
| AC-1 | workspace W has enabled agents Security (A), Performance (B), Junior Mentor (C) | `POST /pulls/:id/review {agentIds: [A, B, C]}` | one `multi_agent_runs` row; 3 `agent_runs` rows pointing at it; response has `multi_agent_run_id` and 3 `runs[]` |
| AC-6 | same workspace | `POST /pulls/:id/review {agentIds: [A]}` | one `agent_runs` row with `multi_agent_run_id` NULL; no `multi_agent_runs` row; response has 1 `runs[]` entry and no `multi_agent_run_id` |
| EC-3 | an old client still sends `{agentId: A}` or `{all: true}` | `POST /pulls/:id/review` | 400 validation error; no rows written |
| EC-3 | a client sends `{agentIds: [A, B], all: true}` | `POST /pulls/:id/review` | 400 validation error; no rows written |
| EC-2 | workspace W has agents A and B; agent C belongs to workspace V | `POST /pulls/:id/review {agentIds: [A, C]}` from W | 404; no `multi_agent_runs` row; no `agent_runs` row for A |
| AC-11 | agent A's last 10 `done` runs: durations 6000…9000 ms, 8 with `cost_usd` and 2 with `null` | estimates are requested | `avg_duration_ms` is the mean of 10; `avg_cost_usd` is the mean of the 8 known costs |
| AC-11 | agent B has no `done` run | estimates are requested | both values `null`; the card shows "—" |

## Traceability and verification

| ID | Source | Verification hint |
|---|---|---|
| AC-1 | D-1, D-3, D-6, D-30 | server `*.it.test.ts`: POST with 2 and 3 `agentIds`, assert one parent row and child FKs (Examples rows AC-1) |
| AC-2 | D-1, D-6, D-30 | server `*.it.test.ts` on the response body |
| AC-3 | D-1; brief "prepare diff+intent once" | server `*.it.test.ts` with mocks: diff source and intent classifier called once for 3 agents |
| AC-4 | brief "one failure doesn't cancel others" | server `*.it.test.ts`: one agent's provider missing, the others reach `done` |
| AC-5 | brief "parallel execution"; `configure-run.png` "parallel fan-out"; D-15 | server `*.it.test.ts` with a slow mock LLM: two child runs `running` at once |
| AC-6 | D-3, D-30 | server `*.it.test.ts`: `{agentIds: [A]}` writes one run with FK NULL, no parent row, no `multi_agent_run_id` in the response (Examples row AC-6) |
| AC-7 | D-6, D-13 | server `*.it.test.ts` on the `GET /multi-runs/:id` shape |
| AC-8 | D-2, D-7 | server unit test on the grouping rule (Examples rows AC-8) |
| AC-9 | D-2; brief "without losing originals and attribution" | server unit test: member count equals input count, ids and text unchanged |
| AC-10 | D-8 | server unit test (Examples rows AC-10) |
| AC-11 | D-9 | server `*.it.test.ts` (Examples rows AC-11) |
| AC-12 | `empty-no-agents.png`; D-12 | client RTL test; manual: compare with `specs/images/spec-0004/empty-no-agents.png` |
| AC-13 | `configure-run-no-pr.png` | client RTL test |
| AC-14 | `configure-run.png`; brief "agent checkboxes" | client RTL test |
| AC-15 | D-9; `configure-run.png` | client RTL test with a `null` estimate |
| AC-16 | `configure-run.png`; brief "time = max, cost = sum"; D-9 | client RTL test |
| AC-17 | D-1; brief "UI only passes the selected set" | client RTL test with mocked fetch: one POST, then navigation |
| AC-18 | `pr-page-agent-picker.png`; D-12 | client RTL test; manual: compare with `specs/images/spec-0004/pr-page-agent-picker.png` |
| AC-19 | `pr-page-agent-picker.png`; D-29 | client RTL test with 2 checked agents: one POST with `agentIds`, then navigation |
| AC-20 | D-12 | client RTL test of the route with an id |
| AC-21 | `results-columns.png`; D-26, D-27 | client RTL test; manual: header against the frame |
| AC-22 | `results-columns.png`; D-13 | client RTL test; manual: compare with `specs/images/spec-0004/results-columns.png` |
| AC-23 | brief "Columns with live statuses"; D-10 | client RTL test with mocked event stream |
| AC-24 | brief "each agent's status updates during the run"; D-10 | client RTL test: stream end triggers refetch |
| AC-25 | brief "one failure doesn't cancel others"; `client/AGENTS.md` null ≠ 0 rule | client RTL test with a failed child |
| AC-26 | `results-tabs-detail.png`, `results-tabs-detail-alt.png`; D-11 | client RTL test; manual: compare with the frames |
| AC-27 | D-11; brief "Accept, Dismiss" | client RTL test with mocked fetch |
| AC-28 | caller requirement "logs per agent" (D-14); `results-columns.png` "View trace" | client RTL test: drawer opens with the clicked run id |
| AC-29 | D-14 | client RTL test with `running` child |
| AC-30 | D-14; brief "trace explains tokens, cost and grounding-gate decisions" | client RTL test; manual: compare the drawer with the PR page |
| AC-31 | D-14 | client RTL test with a failed child |
| AC-32 | D-14 | existing `RunTraceDrawer.test.tsx` stays green |
| AC-33 | `results-columns.png`; D-4 | client RTL test: only participating agents get cells |
| AC-34 | D-4, D-8 | client RTL test |
| AC-35 | `results-columns.png` toggle off; D-8 | client RTL test |
| AC-36 | D-28 | client RTL test: agent with and without a stored summary on the PR |
| AC-37 | D-18 | client RTL test: enabled agents checked, disabled unchecked, on both surfaces |
| AC-38 | D-29, D-30 | client RTL test with mocked fetch: body is `{agentIds: [id]}`, no navigation |
| AC-39 | D-21 | client RTL test: WARNING + SUGGESTION group takes the WARNING title and the smaller line |
| AC-40 | D-30 | `mcp` test (`tools.test.ts` fake HTTP client): the `/pulls/:id/review` body is `{agentIds: [id]}`; existing `run_agent_on_pr` tests stay green |
| AC-41 | D-30; `pr-page-agent-picker.png` (no "Run all" item) | client RTL test: no "Run all" item; the default run sends every enabled agent's id |
| EC-1 | D-30; existing `invalid_run_request` | server `*.it.test.ts`: `{}` and `{agentIds: []}` |
| EC-2 | NFR-4; existing `resolveTargets` 404 | server `*.it.test.ts` (Examples row EC-2) |
| EC-3 | D-30 | server `*.it.test.ts` (Examples rows EC-3) |
| EC-4 | D-23 | server `*.it.test.ts` |
| EC-5 | existing executor behaviour on diff-load failure | server `*.it.test.ts` with a failing diff source |
| EC-6 | NFR-4 | server `*.it.test.ts` with two workspaces |
| EC-7 | design-gap analysis (re-entry after closed tab); D-10 | client RTL test with replayed events |
| EC-8 | design-gap analysis (findings without an end line) | server unit test (Examples row EC-8) |
| EC-9 | D-19 | client RTL test |
| EC-10 | D-20 | client RTL test |
| EC-11 | design-gap checklist "zero results vs a failed run" | client RTL test |
| EC-12 | `empty-no-agents.png` "Pick at least one agent" | client RTL test |
| EC-13 | existing PR dropdown copy "No agents yet — create one" | client RTL test |
| EC-14 | `server/INSIGHTS.md` 2026-09-19 (run marked `done` before its trace is saved) | client RTL test: trace 404 then 200 |
| NFR-1 | D-4, D-6, D-7 | server `*.it.test.ts` with a mock LLM that fails if called |
| NFR-2 | D-7 | server unit test: shuffled input gives identical output |
| NFR-3 | `client/AGENTS.md` "null ≠ 0 in run usage"; `client/INSIGHTS.md` 2026-09-17 | client RTL tests with `null` cost |
| NFR-4 | `security` skill A01 (ownership checks) | server `*.it.test.ts` with two workspaces |
| NFR-5 | `server/AGENTS.md` rate-limit note; D-1 | server `*.it.test.ts` under `NODE_ENV=development` (see `server/INSIGHTS.md` 2026-10-02) |
| NFR-6 | root `AGENTS.md` i18n convention | client RTL test renders keys from messages; review |

**Manual measurement (D-5), done by the user, not by an agent.** On the demo
PR, run one agent alone, then the same agent plus two others, both from
Configure run. Record the numbers below for each run, as shown on the results
page header and in each agent's trace drawer, in the description of this feature's PR (D-25):

| Number | Where it comes from |
|---|---|
| wall-clock duration of the multi-agent run | results header "… total" |
| total cost (sum of known child costs) | results header |
| per agent: duration, tokens in, tokens out, cost | each column, and the trace drawer's Stats |
| per agent: findings before and after the grounding gate | trace drawer |
| diff load and intent derivation time | trace drawer, shared steps |
| number of groups and of conflicts | disagreement block, with the toggle off and then on |

Record the real ratio. Do not fit it to an expected 3×: caching, the shared
diff preparation and response length all move it.

## Decisions

- **D-1** How does the UI start a multi-agent run? → One request carrying the selected subset. The server creates the parent and passes the whole list to the existing executor, so diff and intent are prepared once. No per-agent calls from the UI (accepted, settled before this run). The request shape is now fixed by D-30.
- **D-2** Finding grouping → A pure helper written in this feature. Originals and per-agent attribution are always kept (accepted, settled before this run). The matching rule is narrowed by D-7.
- **D-3** Linking child runs to the parent → New migration: nullable `agent_runs.multi_agent_run_id` FK with an index. Single runs stay NULL (accepted).
- **D-4** Who appears in "Where agents disagree"? → Only agents that took part in this run. A "did not flag" cell has no LLM-generated reason (accepted).
- **D-5** The 1-vs-3 measurement → Manual verification by the user. The spec lists what to record (accepted).
- **D-6** Backend shape (user simplicity constraint, relayed by the caller) → Extend `POST /pulls/:id/review` with optional `agentIds` (superseded by D-30: `agentIds` is now the only field). Add one read endpoint, `GET /multi-runs/:id`. No new module, no new tables, nothing stored for groups or disagreements.
- **D-7** Grouping rule (simplicity constraint) → Same file AND line ranges overlapping or at most 3 lines apart, computed on read. No text or embedding similarity. This replaces the "similar title/category" part of D-2.
- **D-8** What is a conflict? → A participating agent did not flag the group, or the members' severities differ. "Show only conflicts" filters on the client (simplicity constraint).
- **D-9** Estimates → Per agent, the average `duration_ms` and average `cost_usd` of its last 10 `done` runs on any PR. "—" without history. Footer time is the max, cost is the sum of known values (simplicity constraint).
- **D-10** Live status → Reuse the existing per-run event stream, run status and live log as they are. No new event types (simplicity constraint).
- **D-11** Finding actions → Reuse the existing finding card and its actions unchanged. "Reply to author" is out of scope because it does not exist today (simplicity constraint).
- **D-12** Pages → Multi-Agent Review landing, Configure run, and a results page by multi-agent run id with a Columns/Tabs toggle. The PR page reuses its existing Run Review dropdown, extended with checkboxes. No history list (simplicity constraint).
- **D-13** Score ring and summary → The score ring shows `agent_runs.score`. The summary is the run's stored review summary (simplicity constraint).
- **D-14** Per-agent logs (user requirement, relayed by the caller) → Every column and every tab's summary card opens the existing run trace drawer for that agent's run, unchanged. The drawer must become usable from the multi-agent route, and its PR-page behaviour must not change.
- **D-15** Should a multi-agent run execute agents concurrently? → Yes. Diff and intent are still prepared once, and each agent's failure stays isolated (user, 2026-10-10).
- **D-16** "Learn" on the finding card? → Dropped. The results page offers only Accept, Dismiss and Turn into eval case (declined by user, 2026-10-10).
- **D-17** How does a user return to a past multi-agent run? → Only by its URL. No PR-page link and no history list (user, 2026-10-10).
- **D-18** Which agents start checked? → All enabled agents, on Configure run and in the PR dropdown (user, 2026-10-10).
- **D-19** Disagreement cell of a running, failed or cancelled agent? → Shows the run's status, never "did not flag", and does not make a group a conflict (user, 2026-10-10).
- **D-20** Fewer than two finished agents? → The disagreement block shows a "Run two or more agents to compare" hint in place of rows (user, 2026-10-10).
- **D-21** Group row title and line? → Title of the highest-severity member, smallest start line, a tie goes to the agent selected first (user, 2026-10-10).
- **D-22** Do chains of nearby findings merge? → Yes, grouping is transitive (user, 2026-10-10).
- **D-23** Duplicate ids in `agentIds`? → Rejected with 400 `invalid_run_request` (user, 2026-10-10).
- **D-24** Click-through from a Columns finding to its Tabs card? → Not a requirement (declined by user, 2026-10-10).
- **D-25** Where do the 1-vs-3 numbers go? → In the description of this feature's PR (user, 2026-10-10).
- **D-26** Header "total" time? → Wall-clock, from the parent's start to the last child's end (user, 2026-10-10).
- **D-27** Design text "fan-out via worktrees"? → Replaced by "parallel" (user, 2026-10-10).
- **D-28** Configure run card summary line? → The agent's latest stored review summary on the selected PR, else the agent's description (user, 2026-10-10).
- **D-29** PR dropdown with exactly one agent checked? → Today's single-agent run, staying on the PR page. Two or more open a multi-agent run (user, 2026-10-10).
- **D-30** Run request contract (amendment to the approved spec) → `POST /pulls/:id/review` takes one field only, `{agentIds: string[]}` (uuids, at least 1). `agentId` and `all` are removed from the contract, and every caller moves at once: client, server tests, and the MCP `run_agent_on_pr` call site, which brings `mcp` into scope for that one call (user, 2026-10-10). The list length decides the kind of run:
  - One id → today's single-agent run: no parent row, FK NULL, no `multi_agent_run_id` in the response.
  - Two or more ids → one parent row with linked child runs, and `multi_agent_run_id` in the response.
  - Missing or empty list → 400 `invalid_run_request`.
  - Duplicate ids → 400.
  - An id outside the workspace → 404, with nothing written.
  - A body that still sends the removed fields → 400.

## Inputs and provenance

- `agent_runs` (status, error, score, duration, cost, tokens, `ran_at`) gets
  the new nullable `multi_agent_run_id` column (D-3).
- `multi_agent_runs` (id, workspace_id, pr_id, ran_at) already exists from
  `0000_init.sql` and has been empty until now.
- `reviews` (summary, score) and `findings` (file, start/end line, severity,
  title, body, suggestion, confidence, category) come from the existing
  review pipeline. Grounding has already dropped findings that do not cite a
  real diff line.
- `run_traces` and the in-memory run event bus (replay buffer) feed the
  drawer and the live column status.
- `agents` supplies names and icons for the picker.
- **Run request contract (D-30).** Today `RunRequest` in `@devdigest/shared`
  `platform.ts` is `{agentId?, all?}`, with identical server and client
  copies. It becomes `{agentIds}` only, in both copies. The callers that
  change with it:
  - the client's run-review hook;
  - the server's review tests;
  - the MCP package's start-review call (`run_agent_on_pr`). It sends
    `{agentId}` today and hand-types its own request, because `mcp/` does
    not import `@devdigest/shared`.
- **Existing contract stub.** `@devdigest/shared` `observability.ts`
  (identical in both vendored copies) already declares `MultiAgentRun`,
  `AgentColumn`, `Conflict` and `ConflictTake`, marked "computed, not
  stored". It names `POST /pulls/:id/multi-agent-run`, which D-6 replaces
  with `agentIds` on the existing route. Its `ConflictTake.verdict: 'ignored'`
  matches "did not flag", and `note` would be empty (D-4). Whether the planner
  reuses or reshapes it is a planning choice, but any change lands in both
  copies.
- **Run trace drawer location.** Today the drawer lives in the PR route's
  folder. D-14 needs it on the multi-agent route as well. The caller notes
  that moving it to a cross-route location is acceptable, as long as AC-32
  holds.
- **Executor today.** `ReviewRunExecutor.executeRuns` loads the diff and
  intent once (satisfies AC-3), but runs the agents one after another in a
  `for … await` loop. The design ("parallel fan-out", time = max) and the
  brief ("parallel execution") disagree with that. The user chose concurrent execution for multi-agent runs (D-15, AC-5).
- **Design vs brief and data.** The design wins on layout and copy. Where the
  design's mock data contradicts a decided rule, the rule wins:
  - The design shows an "Architecture" cell for an agent not in the run.
    D-4 drops it.
  - The design shows reasons under "did not flag" (e.g. "Not a security
    concern."). D-4 drops them.
  - The design shows Security as "did not flag" at `ratelimit.ts:52`, although
    its own column has a finding there. By AC-8 Security would be a flagger.
  - The design keeps `ratelimit.ts:27` and `:28` apart. By D-7 they are one
    group (Examples).
  - The header text "fan-out via worktrees" does not describe local runs
    It becomes "parallel" (D-27).
- **Learn.** The design shows "Learn" on the finding card. The current card
  has only Accept, Dismiss/Reject and Turn into eval case, and the API
  accepts only `accept|dismiss`. The caller's constraint assumed Learn
  exists. The user dropped Learn (D-16).
- **Prior art (not intent).** Remote-only branches carry another course
  participant's implementation (`ae94908`, "SPEC-13"). It is not part of this
  repo's history and was not used as design.

## Untrusted inputs

- Finding title, body, suggestion and category are LLM output. They render
  through the existing finding card: Markdown escaped, no raw HTML, links
  limited to http/https. A group or row title is shown as plain text.
- File paths in findings are LLM output, but grounding has already matched
  them to the diff. They are shown as text and never used to read files.
- PR title and number come from GitHub (attacker-controllable). They are
  rendered as plain text.
- `agentIds` is client input. Each id must be a well-formed id of an agent in
  the caller's workspace (EC-2, NFR-4). It is never interpolated into SQL or
  prompts.
- The `:id` of `GET /multi-runs/:id` is validated as an id and scoped to the
  workspace (EC-6).
- Agent names come from users of the workspace and are rendered as plain
  text.

## Open questions

None. OQ-1 to OQ-15 of the earlier draft were answered by the user on 2026-10-10 and are recorded as D-15 to D-29.
