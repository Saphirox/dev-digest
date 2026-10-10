# Spec: Export an agent to CI (GitHub Actions)

Spec ID: SPEC-0005
Status: approved
Supersedes: —
Modules: client (owner), server
Design: specs/images/spec-0005/agent-ci-tab.png, specs/images/spec-0005/wizard-target.png, specs/images/spec-0005/wizard-preview.png, specs/images/spec-0005/wizard-configure.png, specs/images/spec-0005/wizard-install.png (no frame for the CI Runs page or the CI tab's version / "View runs" / "Fail CI on" additions — none is coming; simple defaults per D-16, D-17)

## Problem and user

A tuned review agent runs only on the developer's machine, so the team cannot
rely on it for every pull request. The developer who tuned the agent wants to
check its configuration into a repository and have GitHub Actions run the same
review on each PR, then see those CI runs back in the studio.

An identical manifest guarantees identical configuration, not byte-identical
output (model answers vary, CI tool versions differ), so each CI run must
record what it ran with.

This is a deliberately simple first iteration (D-1): GitHub Actions only, static
secret hints, results pulled from GitHub, no speculative extras.

## Goals / Non-goals

Goals:
- An "Add to CI" wizard (Target → Preview → Configure → Install) that turns the
  agent's current configuration into repository files and opens a PR on a
  `devdigest/ci` branch, or hands the files over as a zip.
- The exported workflow runs the bundled `agent-runner`, validated against the
  same `AgentManifest` schema the studio writes.
- CI run results are pulled back into the studio from GitHub Actions artifacts
  as `agent_runs` rows with `source = 'ci'`, visible on a CI Runs page and on
  the agent's CI tab.

Non-goals:
- CircleCI, Jenkins and Generic CLI targets — no generators exist; their cards are hidden (D-2).
- Live checks of whether repository secrets are set (D-3).
- The `devdigest/review-action@v1` published action — it stays a placeholder; the workflow runs the bundled runner (brief).
- An "Update CI config" button — re-running "Add to CI" on an installed repository updates it instead (D-6).
- Choosing a target repository inside the wizard — the active workspace repository is the target (D-5).
- Recording an installation for the zip option, or ingesting runs of zip setups (D-8).
- Showing CI runs on the PR page timeline or in the PR list cost column (D-9).
- Background polling of CI results (D-10).
- The "GitHub Action setup docs" link on the Install step (D-11).
- An inbound endpoint that accepts CI results pushed from GitHub (D-12).
- Exporting `.devdigest/memory.jsonl` (D-13).
- More than one agent per repository (D-14).
- Filter controls on the CI Runs page (D-1, D-17).
- Any change to the multi-agent run service or the PR feed (brief, scope "worktree B").

## User stories

- As the developer who tuned an agent, I want to open a PR that adds the agent
  and a workflow to my repository, so that every teammate's PR gets the same
  review without running the studio.
- As that developer, I want to see each CI review's verdict, findings, cost and
  job link in the studio, so that I can tell whether the CI agent is useful.

## Acceptance criteria (EARS)

Wizard

- **AC-1** `[client]` `must` WHEN the user clicks "Add to CI" or "+ Add repository" on the agent's CI tab, the agent page shall open the "Export to CI" dialog titled "Run <agent name> automatically on pull requests" at step 1 of the four steps Target, Preview, Configure, Install.
- **AC-2** `[client]` `must` The Target step shall show one target card, "GitHub Actions" with the "recommended" badge and the text "Runs on pull_request events", and shall show no CircleCI, Jenkins or Generic CLI card.
- **AC-3** `[server, client]` `must` WHEN the user reaches the Preview step, the wizard shall list under "FILES TO CREATE" the files returned by `POST /agents/:id/export-ci/preview` (response `files: CiFile[]`), which shall be `.devdigest/agents/<agent-slug>.yaml`, one `.devdigest/skills/<skill-slug>.md` per skill enabled on the agent, every file of the runner build output under `.devdigest/runner/` (entry `.devdigest/runner/index.js` plus any sibling chunks and `package.json` the build emits) and `.github/workflows/devdigest-review.yml`, and no `.devdigest/memory.jsonl`.
- **AC-4** `[client]` `must` WHEN the user selects a file in the Preview list, the Preview step shall show that file's contents, editable only for `.github/workflows/devdigest-review.yml` (labelled "editable") and read-only for every other file.
- **AC-5** `[server]` `must` The exported manifest shall be YAML that parses with the `AgentManifest` schema to the agent's current name, system prompt, skill slugs, strategy and `ci_fail_on`.
- **AC-6** `[server]` `must` Each exported skill file shall contain the body of the skill version enabled on the agent.
- **AC-7** `[server]` `must` The generated workflow shall run on `pull_request` with exactly the event types selected in the Configure step, check out the repository and run `node .devdigest/runner/index.js`; it shall not reference `devdigest/review-action`.
- **AC-8** `[server]` `must` The generated workflow shall pass `OPENROUTER_API_KEY` from `${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN` from the Actions-provided token, `GITHUB_REPOSITORY`, `PR_NUMBER`, and `DEVDIGEST_POST_AS` set to the Configure step's "Post results as" choice (`github_review`, `pr_comment` or `none`).
- **AC-9** `[server]` `must` The generated workflow shall skip the review job for pull requests whose head repository is a fork.
- **AC-10** `[client]` `must` The Configure step shall show the trigger chips `pull_request:opened`, `pull_request:synchronize` and `pull_request:reopened`, with opened and synchronize selected and reopened unselected by default.
- **AC-11** `[client]` `must` The Configure step shall show a "Secrets expected" table with `OPENROUTER_API_KEY` marked as required with the hint to add it to the repository's Actions secrets, and `GITHUB_TOKEN` marked "Auto-provided by Actions", without querying GitHub for whether either secret exists.
- **AC-12** `[client]` `must` The Configure step shall offer "Post results as" with the options "GitHub review" (selected by default, badged "recommended"), "PR comment" and "None (exit code only)".
- **AC-13** `[client]` `must` The Configure step shall show the note that blocking merges needs "Fail CI on" (CI tab) so the run exits non-zero, plus a required status check in the repository's branch protection, with no GitHub App needed.
- **AC-14** `[client]` `must` The Install step shall offer "Open a PR with these files" (selected by default, badged "recommended") naming the target repository, the PR title "Add DevDigest CI review" and the actual number of files, and "Copy files as a zip — add them manually".
- **AC-15** `[server, client]` `must` WHEN the user clicks "Install" with "Open a PR with these files", the API (`POST /agents/:id/export-ci`, body `CiExportInput` with `action: 'open_pr'`) shall commit the files, including any kept workflow edits, onto the branch `devdigest/ci` created from the repository's default branch and open a PR titled "Add DevDigest CI review" into the default branch, and the wizard shall show a link to that PR.
- **AC-16** `[server]` `must` The export shall never commit to the repository's default branch.
- **AC-17** `[server, client]` `must` WHEN the user clicks "Install" with "Copy files as a zip", the browser shall download a zip from `POST /agents/:id/export-ci` (body `action: 'files'`) containing every listed file at its listed path, including any kept workflow edits.
- **AC-18** `[server, client]` `must` WHEN a PR export succeeds, the API shall record a CI installation for the agent and the repository (`CiInstallation`, including the exported `agent_version`), and the CI tab shall list that repository.
- **AC-19** `[server]` `must` WHERE the agent's provider is `openai` or `anthropic`, the exported manifest shall set `provider: openrouter` and `model` to the OpenRouter id `<provider>/<model>`; WHERE the provider is `openrouter`, the model id shall be written unchanged.
- **AC-20** `[client]` `must` WHEN the user changes a trigger or "Post results as" choice after editing the workflow in the Preview step, the wizard shall regenerate the workflow from the Configure choices, discard the earlier edits, and show a notice that the workflow edits were replaced.

CI tab

- **AC-21** `[server, client]` `must` The agent's CI tab shall show the heading "CI deployment", a badge "Active in N repos" where N is the agent's installation count, and the "Add to CI" button, reading installations from `GET /agents/:id/ci/installations`.
- **AC-22** `[server, client]` `must` The CI tab shall show one row per installation with the repository `owner/name`, a "GitHub Actions" chip, the exported agent version (e.g. "v3"), the status of its latest ingested CI run, that run's relative time and a "View runs" link to the CI Runs page, followed by a dashed "+ Add repository" row.
- **AC-23** `[client]` `must` The CI tab shall show a "Fail CI on" select with the options never, critical, warning and any, which saves the agent's `ci_fail_on` through the same agent update the Config tab uses and shows the hint that the change reaches CI after the next "Add to CI".

Ingest and trace

- **AC-24** `[server]` `must` The generated workflow shall upload the runner's `devdigest-result.json` as a workflow artifact named `devdigest-result`.
- **AC-25** `[server]` `must` WHEN a CI refresh runs, the API shall, for each recorded installation, list completed runs of `.github/workflows/devdigest-review.yml` in that repository through the GitHub API with the studio's GitHub token and download each new run's `devdigest-result` artifact.
- **AC-26** `[server]` `must` The API shall accept CI results only through the GitHub artifact pull of AC-25 and shall expose no route that accepts CI results sent to it.
- **AC-27** `[server]` `must` WHEN a CI run result is ingested, the API shall store it as one `agent_runs` row with `source = 'ci'`, the installation's agent, the model, cost in USD, duration and findings count.
- **AC-28** `[server]` `must` WHEN a CI run result is ingested, the API shall store a trace for that run that records the agent version the manifest was exported from, the model, the runner version, the skill slugs and the commit SHA the job reviewed.
- **AC-29** `[server]` `must` The API shall validate every ingested result with the `CiResultArtifact` schema before storing anything from it.

CI Runs page

- **AC-30** `[server, client]` `must` The CI Runs page (`/ci-runs`, sidebar "CI Runs") shall show a plain table of ingested CI runs newest first from `GET /ci/runs`, with the columns repository, PR (number linked to the PR on GitHub), agent, verdict, findings, cost, duration and job (link to the GitHub Actions run).
- **AC-31** `[server, client]` `must` The verdict shown for a CI run shall be "Changes requested" when the run's findings meet the manifest's `ci_fail_on` threshold, "Passed" when they do not, and "Failed" when the job produced no valid result.
- **AC-32** `[server, client]` `must` WHEN the user opens the CI Runs page or clicks its "Refresh" button, the page shall trigger a CI refresh (`POST /ci/runs/refresh`) and then show the updated list.

## Edge cases

- **EC-1** `[server, client]` `must` IF the studio has no GitHub token configured, THEN "Install" with "Open a PR" shall fail with a message pointing to Settings, and the zip option shall still work.
- **EC-2** `[server, client]` `must` IF GitHub refuses the commit because the token lacks permission to write workflow files, THEN the wizard shall say the token needs the `workflow` permission and suggest the zip option, and no installation shall be recorded.
- **EC-3** `[server]` `must` IF the branch `devdigest/ci` already exists with an open PR, THEN the export shall add a new commit to that branch and return the existing PR's URL instead of opening a second PR.
- **EC-4** `[server]` `must` IF the branch `devdigest/ci` exists but has no open PR, THEN the export shall commit onto it and open a new PR.
- **EC-5** `[server, client]` `must` IF the agent has no enabled skills, THEN the manifest shall have an empty `skills` list, no skill file shall be listed, and the Install step's file count shall match.
- **EC-6** `[client]` `must` IF no trigger chip is selected, THEN the Configure step shall disable "Continue" and say at least one trigger is required.
- **EC-7** `[server, client]` `must` IF the runner bundle is not available to the API, THEN the Preview step shall show an error naming the missing runner and the wizard shall not let the user install.
- **EC-8** `[server]` `must` WHEN the same GitHub Actions workflow run is ingested more than once (repeated refresh, two tabs, or a re-run attempt), the API shall keep one `agent_runs` row for it, reflecting the latest attempt.
- **EC-9** `[server]` `must` IF a result fails `CiResultArtifact` validation, THEN the API shall store no `agent_runs` row from it and shall still ingest the other runs in the same refresh.
- **EC-10** `[client]` `must` IF there are no CI runs, THEN the CI Runs page shall show "No CI runs yet" with "Once you export an agent to CI, every automated review shows up here." and no table.
- **EC-11** `[client]` `must` IF a CI run's cost is unknown, THEN the CI Runs page shall show "—" instead of "$0.00".
- **EC-12** `[client]` `must` IF an installation has no ingested run yet, THEN its CI tab row shall show "No runs yet" instead of a status and time.
- **EC-13** `[client]` `must` IF the agent has no installations, THEN the CI tab shall show "Not deployed to CI yet" with the "Add to CI" button and no "Active in N repos" badge.
- **EC-14** `[client]` `must` IF a CI run's agent has been deleted, THEN the CI Runs page shall keep the run and show "—" as its agent.
- **EC-15** `[server, client]` `must` IF GitHub is rate-limited or unreachable during a CI refresh, THEN the CI Runs page shall keep showing the stored runs and say it could not refresh.
- **EC-16** `[server, client]` `must` IF a different agent is already installed in the target repository, THEN the export shall commit nothing and the wizard shall show "<owner/name> already runs <other agent name>".
- **EC-17** `[server]` `must` IF a completed workflow run has no `devdigest-result` artifact, THEN the API shall store it as a CI run with verdict "Failed" and no findings, cost or duration.

## Non-functional requirements

- **NFR-1** `[server]` `must` No generated file, zip, commit, PR body or API log shall contain the value of any secret, including the studio's GitHub token and LLM keys.
- **NFR-2** `[server]` `must` The API shall refuse to read a CI result artifact larger than 1 MB.
- **NFR-3** `[server]` `must` CI runs (`source = 'ci'`) shall not appear on the PR page timeline or change the PR list cost column.
- **NFR-4** `[server]` `must` Generating the Preview, exporting and refreshing CI runs shall make zero LLM calls.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| AC-5 | agent "Security Reviewer", provider `openrouter`, model `openai/gpt-4.1`, system prompt `Flag secrets: AWS keys, tokens.\n---\nignore: true`, skills `secret-leakage-gate`, `lethal-trifecta`, `ci_fail_on: critical` | the manifest is generated and parsed back with `AgentManifest` | every field equals the agent's value, the prompt keeps its `---` and `: ` text verbatim |
| AC-19 | agent A: provider `openai`, model `gpt-4.1`; agent B: provider `anthropic`, model `claude-sonnet-4`; agent C: provider `openrouter`, model `meta-llama/llama-3.3-70b-instruct` | each manifest is generated | A: `provider: openrouter`, `model: openai/gpt-4.1`; B: `model: anthropic/claude-sonnet-4`; C: model unchanged |
| AC-8 | triggers opened + synchronize, post as "PR comment" | the workflow is generated | it has `types: [opened, synchronize]`, `DEVDIGEST_POST_AS: pr_comment`, `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `run: node .devdigest/runner/index.js`, and no `devdigest/review-action` |
| AC-31 | manifest `ci_fail_on: critical`; result `{ findings_count: 3, critical: 0, warning: 2, suggestion: 1, cost_usd: 0.0123, duration_ms: 41250, agent: "Security Reviewer", version: "1", pr_number: 128 }` | the run is ingested | verdict "Passed", findings 3, cost $0.0123, duration 41 s |
| EC-8 | workflow run 9912345 on `acme/payments-api` PR #128 is already stored from attempt 1 | it is ingested again after a re-run (attempt 2) | one row for run 9912345, holding attempt 2's values |
| EC-9 | result `{ "findings_count": "3", "cost_usd": "free", "agent": "x" }` beside a valid result in the same refresh | the refresh ingests both | no row from the invalid one; the valid one is stored |
| EC-16 | `acme/payments-api` has an installation of "Performance Reviewer" | the user exports "Security Reviewer" to `acme/payments-api` | nothing is committed; the wizard shows "acme/payments-api already runs Performance Reviewer" |

## Traceability and verification

| ID | Source | Verification hint |
|---|---|---|
| AC-1 | brief "Add to CI button opens an Export Wizard"; `specs/images/spec-0005/wizard-target.png`; `specs/images/spec-0005/agent-ci-tab.png` | client RTL test |
| AC-2 | D-2; `specs/images/spec-0005/wizard-target.png` | client RTL test (no other target cards) |
| AC-3 | brief "Preview: manifest, skills…"; `agent-runner/AGENTS.md` (runner embedded as `.devdigest/runner/index.js`); D-13; `specs/images/spec-0005/wizard-preview.png` | server `*.it.test.ts` for the route; client RTL test |
| AC-4 | brief "editable `.github/workflows/devdigest-review.yml`"; `specs/images/spec-0005/wizard-preview.png` | client RTL test |
| AC-5 | brief "validate the manifest with the SAME Zod schema" | server unit test round-trip (Examples row AC-5) |
| AC-6 | brief "attached skills" | server unit test |
| AC-7 | brief "workflow runs the bundled agent-runner… placeholder" | server unit test (Examples row AC-8) |
| AC-8 | `agent-runner/AGENTS.md` (env vars read); `agent-runner/insights/INSIGHTS.md` 2026-07-08 (post_as gap); D-4; `specs/images/spec-0005/wizard-configure.png` | server unit test (Examples row AC-8) |
| AC-9 | `agent-runner/src/context.ts` intent ("the workflow… never scheduling this job for fork PRs") | server unit test on workflow text |
| AC-10 | brief "opened, synchronize, optionally reopened"; `specs/images/spec-0005/wizard-configure.png` | client RTL test |
| AC-11 | D-3; D-4; `specs/images/spec-0005/wizard-configure.png` | client RTL test (no GitHub call) |
| AC-12 | brief "GitHub review, PR comment, or exit code only"; `specs/images/spec-0005/wizard-configure.png` | client RTL test |
| AC-13 | `specs/images/spec-0005/wizard-configure.png` | client RTL test |
| AC-14 | brief "open a PR… or download a zip"; `specs/images/spec-0005/wizard-install.png` | client RTL test (file count with 0 and 2 skills) |
| AC-15 | brief "separate branch `devdigest/ci` and a PR"; D-5; D-6 | server `*.it.test.ts` with a mock GitHub client |
| AC-16 | brief "never writes directly to main" | server `*.it.test.ts` asserting the committed ref |
| AC-17 | brief "download a zip"; D-8; `specs/images/spec-0005/wizard-install.png` | server unit test on archive entries; client RTL test |
| AC-18 | brief "CI tab shows installations"; D-16; `specs/images/spec-0005/agent-ci-tab.png` | server `*.it.test.ts`; client RTL test |
| AC-19 | D-15 | server unit test (Examples row AC-19) |
| AC-20 | D-18 | client RTL test |
| AC-21 | `specs/images/spec-0005/agent-ci-tab.png` | client RTL test; manual: compare with `specs/images/spec-0005/agent-ci-tab.png` |
| AC-22 | `specs/images/spec-0005/agent-ci-tab.png`; brief "workflow version, history"; D-16 | client RTL test; manual: compare with the frame |
| AC-23 | brief "the \"Fail CI on\" setting"; D-16 | client RTL test |
| AC-24 | D-12 | server unit test on workflow text |
| AC-25 | D-12; D-10 | server `*.it.test.ts` with a mock GitHub client |
| AC-26 | brief "accepts results only via an authenticated endpoint or another verified channel"; D-12 | server `*.it.test.ts` (no ingest route registered) |
| AC-27 | brief "Ingest writes the run into `agent_runs` with `source='ci'`" | server `*.it.test.ts` |
| AC-28 | brief "the trace stores the manifest version, model, dependencies and commit SHA" | server `*.it.test.ts` |
| AC-29 | brief "verified channel"; `agent-runner/src/artifact.ts` intent (same schema on ingest) | server unit test |
| AC-30 | brief "CI Runs page shows repository, PR, agent, verdict, findings, cost, duration and a link to the job"; D-17 | server `*.it.test.ts`; client RTL test |
| AC-31 | brief "verdict"; `agent-runner/AGENTS.md` (deterministic gate on `ci_fail_on`) | server unit test (Examples row AC-31) |
| AC-32 | D-10 | client RTL test |
| EC-1 | D-1 (missing configuration state) | server `*.it.test.ts`; client RTL test |
| EC-2 | D-1 (missing permission state) | server `*.it.test.ts` with a mock GitHub 403/404 |
| EC-3 | D-6; GitHub port `findOpenPr` intent ("so re-publish reuses it") | server `*.it.test.ts` |
| EC-4 | D-1 | server `*.it.test.ts` |
| EC-5 | D-1 (zero items state) | server unit test; client RTL test |
| EC-6 | D-1 (invalid configuration) | client RTL test |
| EC-7 | D-1; `agent-runner/AGENTS.md` (bundle is a build output) | server unit test; client RTL test |
| EC-8 | D-1 (concurrent refresh, re-run) | server `*.it.test.ts` (Examples row EC-8) |
| EC-9 | security skill A08 (untrusted artifact) | server unit test (Examples row EC-9) |
| EC-10 | `client/messages/en/ci.json` `runs.emptyTitle`/`emptyBody` | client RTL test |
| EC-11 | `server/src/db/schema/runs.ts` `costUsd` (NULL = unknown, never $0.00) | client RTL test |
| EC-12 | D-1 (first run state) | client RTL test |
| EC-13 | D-1 (empty state); `client/messages/en/ci.json` `ciTab.empty` | client RTL test |
| EC-14 | D-1 (deleted agent) | client RTL test |
| EC-15 | D-12 (degraded: GitHub rate-limited) | server `*.it.test.ts` with a mock GitHub 403 rate-limit; client RTL test |
| EC-16 | D-14; `agent-runner/src/manifest.ts` (exactly one manifest) | server `*.it.test.ts` (Examples row EC-16); client RTL test |
| EC-17 | D-12; `agent-runner/src/run.ts` (hard failure writes no artifact) | server `*.it.test.ts` |
| NFR-1 | `agent-runner/AGENTS.md` ("Do not log these values"); security skill A09 | server unit test scanning generated files for the fixture secret |
| NFR-2 | security skill A06/A08 (bounded untrusted input) | server unit test |
| NFR-3 | D-9; brief "must NOT touch… the PR feed" | server `*.it.test.ts` on the PR timeline and cost queries |
| NFR-4 | brief "configuration… serialized" (deterministic generation) | server unit test with an LLM mock that fails on any call |

## Decisions

- **D-1** How much to build in this first iteration? → the simplest option at every gap; non-essential items are future iterations (user, relayed by the caller).
- **D-2** Show CircleCI, Jenkins, Generic CLI targets? → no; GitHub Actions only, the other cards hidden (user).
- **D-3** How is the "not set"/"ready" secret status determined? → static hints, no live GitHub secret check (user).
- **D-4** Secret name `OPENAI_API_KEY` (Preview mockup) or `OPENROUTER_API_KEY` (Configure frame)? → `OPENROUTER_API_KEY` (confirmed by user).
- **D-5** Which repository is the target? → the active workspace repository (confirmed by user).
- **D-6** What does "Update CI config" do? → hidden this iteration; re-running "Add to CI" on an installed repository updates its branch and PR (confirmed by user).
- **D-7** What does "+ Add repository" do? → opens the same wizard as "Add to CI" (D-1).
- **D-8** Does the zip option record an installation? → no; its runs are not ingested (confirmed by user).
- **D-9** Do CI runs appear in the PR feed? → no (brief "must NOT touch… the PR feed"; D-1).
- **D-10** When are CI results fetched? → on opening the CI Runs page and on "Refresh"; no background polling (D-1).
- **D-11** "GitHub Action setup docs" link? → omitted; no such docs exist yet (D-1).
- **D-12** How do CI results reach the local-first studio, and how is that verified? → the studio pulls `devdigest-result` artifacts through the GitHub API with its own token; no inbound endpoint (user, OQ-1).
- **D-13** Include `.devdigest/memory.jsonl`? → no, not this iteration (declined by user, OQ-2).
- **D-14** A different agent is already installed in the repository? → refuse with a message (user, OQ-3; replace declined).
- **D-15** Agents on `openai`/`anthropic` providers? → write the OpenRouter model id (e.g. `openai/gpt-4.1`) into the manifest (user, OQ-4; refusing export declined).
- **D-16** CI tab additions without a frame? → no screenshot coming; each row shows the agent version, history is a "View runs" link, "Fail CI on" is the same four-value select as the Config tab (user, OQ-5).
- **D-17** CI Runs page without a frame? → no screenshot coming; a plain table with the brief's columns (user, OQ-6).
- **D-18** Workflow edits in Preview vs later Configure changes? → Configure regenerates the workflow and discards the edits, with a notice (user, OQ-7; keeping edits declined).

## Inputs and provenance

- Agent configuration and enabled skill versions — `agents`, `agent_versions`, `agent_skills` (studio DB).
- Runner bundle — the `agent-runner` package build output (all files in `agent-runner/dist/`), embedded under `.devdigest/runner/` with entry `index.js`. Amended 2026-10-10 by the user: the ncc build emits extra chunks, so the whole directory is exported.
- GitHub API through the studio's GitHub token — default branch, branch/commit/PR creation, workflow runs of the installed workflow and their `devdigest-result` artifacts (D-12).
- CI result — `devdigest-result.json` written by `agent-runner` (`CiResultArtifact`), produced in the target repository's Actions runner and uploaded as an artifact.
- User input — Configure choices, workflow YAML edits, the CI tab's "Fail CI on".
- Stored — `ci_installations`, `agent_runs` (`source = 'ci'`), `run_traces`, `ci_runs` (pre-created tables).
- Disagreements resolved: the Preview frame's `uses: devdigest/review-action@v1` and `OPENAI_API_KEY` lose to the brief ("placeholder until such a published action exists") and to the Configure frame plus `agent-runner/AGENTS.md` (`OPENROUTER_API_KEY`, D-4). The brief and Preview frame list `.devdigest/memory.jsonl`; the user dropped it (D-13). The brief's CI tab "workflow version, history, Fail CI on" is not in the frame; added per D-16. The CI tab frame's "Update CI config" button is deferred (D-6). The Target frame's other target cards are hidden (D-2). Prior art: a fork's implementation on remote branch `full-functionality` (`fcc523a`, `plans/14-export-to-ci.md`) also pulled Actions artifacts; it was read for corner cases only.

## Untrusted inputs

- **CI result artifact** — written by code running in the target repository's CI; a PR author with write access can change the workflow or runner in their PR and forge it. Size-capped (NFR-2), validated with `CiResultArtifact` (AC-29, EC-9), its `agent` field is not trusted for attribution (the installation's agent is used, AC-27), and every string from it is escaped when rendered.
- **GitHub run metadata** (job URL, head SHA, PR number) — rendered as text; only `https://github.com/` URLs become links.
- **Agent system prompt, name and skill bodies** — user-authored text serialised into YAML and Markdown; serialisation must round-trip verbatim (AC-5) and never be interpolated into the workflow's shell steps.
- **Edited workflow YAML** — the user's own text, committed as-is; never executed by the studio.
- **PR title, body and diff in CI** — handled by `agent-runner` through `reviewer-core`'s untrusted wrapping (unchanged by this spec).

## Open questions

None.
</content>
