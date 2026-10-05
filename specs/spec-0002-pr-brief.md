# Spec: PR Brief on the PR Overview tab

Spec ID: SPEC-0002
Status: approved
Supersedes: —
Modules: server (owner), client
Design: specs/images/spec-0002/overview-pr-brief.png, specs/images/spec-0002/files-changed-target.png, specs/images/spec-0002/overview-summary-banner-annotated.png, specs/images/spec-0002/overview-risks-focus-annotated.png

## Problem and user

A reviewer who opens a pull request in DevDigest sees the facts the app
already computes — the PR's intent, its blast radius, its diff stats — as
separate cards, but nothing tells them in one place what the PR does, what
could go wrong, and which lines to read first. They need one PR Brief on the
Overview tab: a short model-written summary, concrete risks tied to files,
and a reading order of `file:line — reason` items that jump into the diff.

## Goals / Non-goals

Goals:
- One PR Brief block on the Overview tab: summary banner, Intent and Blast
  radius blocks, Risk areas, Review focus.
- Generate the brief on demand with exactly one model call over facts the
  app has already computed; the model never sees diff hunk bodies.
- Every file a risk or a review-focus item names exists in the PR or in the
  blast-radius map.
- Store the brief with the commit it was generated for, so a reload shows
  it without a model call.
- A review-focus item opens that file on the Files changed tab.
- Replace the deterministic Risk Areas scanner with the brief's model risks
  (D-1, D-2).

Non-goals:
- The deterministic Risk Areas scanner and `GET /pulls/:id/risks`; they are
  removed (D-2).
- `history` inside the brief; prior PRs stay a Blast radius concern (D-3).
- Regenerating the brief automatically when the PR gets new commits
  (declined by user, D-4).
- Deriving a missing intent as part of brief generation (declined by user,
  D-15).
- Scrolling to or highlighting the cited line on Files changed (declined by
  user, D-10).
- Expand-a-risk-to-read-its-explanation in Risk areas (brief: P3).
- Pixel-matching the design; a plain list is acceptable (brief).
- The model reading diff code (brief: "does not read the diff code itself").

## User stories

- As a reviewer, I want to click "Generate brief" on a PR and get a summary,
  its risks and a reading order, so that I know where to start.
- As a reviewer, I want to click `src/config.ts:12 — live Stripe key
  committed in plaintext` and land on that file in Files changed.
- As a reviewer, I want to reload the page and see the same brief without
  paying for another model call.

## Acceptance criteria (EARS)

- **AC-1** `[client]` `must` The Overview tab shall show a block labelled "PR Brief" holding, in order, the summary banner, the Intent and Blast radius blocks side by side, Risk areas, and Review focus, with the PR description below the block.
- **AC-2** `[server, client]` `must` WHILE `GET /pulls/:id/brief` reports no stored brief for the PR, the PR Brief block shall show a "Generate brief" button.
- **AC-3** `[server]` `must` WHEN `POST /pulls/:id/brief` is called, the API shall make exactly one structured model call, using the provider and model the workspace's `risk_brief` feature-model setting resolves to.
- **AC-4** `[server]` `must` WHEN the API builds the model input for a brief, the input shall contain the PR title and description, the stored intent, the blast-radius `summary` and caller file paths, the per-file diff stats (path, additions, deletions, Smart Diff role), the linked issue, and the spec documents attached to the workspace's enabled agents and their skills, each only when available.
- **AC-5** `[server]` `must` IF a model-proposed risk names no file that is a file of the PR or a file in the PR's blast-radius map, THEN the API shall drop that risk before storing the brief.
- **AC-6** `[server]` `must` IF a model-proposed review-focus item names a file that is neither a file of the PR nor a file in the PR's blast-radius map, THEN the API shall drop that item before storing the brief.
- **AC-7** `[server, client]` `must` The `GET` and `POST /pulls/:id/brief` response shall be a `PrBrief` with `summary` (string), `risks[]`, `review_focus[]` (each `{ file, line, reason }`, `line` a positive integer), `generated_for_sha`, `generated_at`, `missing_inputs[]`, and nullable `cost_usd`, `tokens_in`, `tokens_out`, and shall carry no `intent`, `blast` or `history` field; both vendored copies of the `@devdigest/shared` brief contract shall define it identically.
- **AC-8** `[server, client]` `must` Each `Risk` in the brief contract shall be `{ kind, title, explanation, severity, file_refs[] }`, with `kind` free text, `severity` one of `high|medium|low`, and each `file_refs` entry `{ file, start_line?, end_line? }` with optional positive-integer lines; the contract shall no longer define `RiskKind`, `RiskRef` or `PrRisks`.
- **AC-9** `[server]` `must` WHEN a brief is generated, the API shall store it in the PR's `pr_brief` row together with the PR head commit SHA it was generated for, replacing any earlier brief for that PR.
- **AC-10** `[server]` `must` WHEN `GET /pulls/:id/brief` is called and a brief is stored for the PR, the API shall return the stored brief without calling the model.
- **AC-11** `[client]` `must` WHEN a brief exists for the PR, the PR Brief banner shall show the brief's summary text.
- **AC-12** `[server, client]` `must` WHILE the PR has at least one completed review, the PR Brief banner shall reuse the existing verdict banner to show the verdict, findings count, blocker count and PR score of the single most recent completed review — the same review the Agent runs tab's verdict banner shows — beside the brief summary.
- **AC-13** `[client]` `must` WHILE the PR has no completed review, the PR Brief banner shall show the brief summary without a verdict, counts or score.
- **AC-14** `[client]` `must` WHEN a brief exists for the PR, the PR Brief banner shall show the generation's cost and token counts, rendering an unknown cost as "—" and omitting unknown token counts.
- **AC-15** `[client]` `must` WHEN a brief exists for the PR, Risk areas shall list each risk's title, a severity icon whose colour shows its severity, and each file ref as `path`, `path:line` or `path:start-end`.
- **AC-16** `[client]` `must` WHEN a brief exists for the PR, Review focus shall list `file:line — reason` items in the order the API returned them, with the item count beside the heading "Review focus — read these first".
- **AC-17** `[client]` `must` WHEN the user activates a review-focus item whose file is a file of the PR, the PR page shall switch to `?tab=diff` and show that file's card expanded and scrolled into view, including a file whose card or Smart Diff group starts collapsed.
- **AC-18** `[client]` `must` WHEN a review-focus item's file is only in the blast-radius map, the item shall be a link to that file's GitHub blob at the cited line, at the blast radius `indexed_sha` or, when that is absent, the PR head SHA, opening in a new tab.
- **AC-19** `[client]` `must` WHILE the PR has a stored intent or a blast radius, the PR Brief block shall show the existing Intent block and Blast radius block.
- **AC-20** `[server]` `must` IF the intent, the blast radius or the linked issue is unavailable when a brief is generated, THEN the API shall still generate the brief and list each missing input in `missing_inputs`.
- **AC-21** `[client]` `must` WHILE a stored brief has a non-empty `missing_inputs`, the PR Brief block shall state in text which data was missing when the brief was generated.
- **AC-22** `[client]` `must` WHEN the user clicks the refresh button in the PR Brief block, the PR page shall call `POST /pulls/:id/brief` and show the newly returned brief.
- **AC-23** `[client]` `must` WHILE a brief generation request is in flight, the PR Brief block shall show a loading state and disable the Generate and refresh buttons.
- **AC-24** `[client]` `must` WHILE the stored brief's `generated_for_sha` differs from the PR's current head SHA, the PR Brief block shall show a "Stale — regenerate" badge.
- **AC-25** `[server, client]` `must` The API shall no longer serve `GET /pulls/:id/risks`, and the Overview tab shall no longer show the deterministic Risk Areas list inside the Intent block.
- **AC-26** `[server]` `must` IF a model-proposed risk has some `file_refs` whose file is neither a file of the PR nor in the PR's blast-radius map, THEN the API shall drop only those refs and keep the risk with its valid refs.
- **AC-27** `[client]` `must` WHEN the user activates a risk's file ref whose file is a file of the PR, the PR page shall behave as AC-17 for that file.
- **AC-28** `[client]` `must` WHEN a risk's file ref names a file only in the blast-radius map, the ref shall be a GitHub blob link built as in AC-18, opening in a new tab.

## Edge cases

- **EC-1** `[server]` `must` IF the blast radius returns `degraded: true` with no changed symbols (for example an unindexed repository, reason `no_data`), THEN the API shall treat the blast radius as missing for AC-20 and name the degradation reason.
- **EC-2** `[client]` `must` IF a stored brief has zero risks after validation, THEN Risk areas shall show the `brief.noRisks` text instead of an empty list.
- **EC-3** `[client]` `must` IF a stored brief has zero review-focus items after validation, THEN Review focus shall show a "nothing to read first" text instead of an empty list.
- **EC-4** `[server]` `must` IF the `risk_brief` provider has no API key configured, THEN `POST /pulls/:id/brief` shall fail with an error that names the missing configuration rather than a generic failure.
- **EC-5** `[server]` `must` IF the model call fails (provider error, timeout, missing key, or a response that fails schema validation after the structured-call retries), THEN `POST /pulls/:id/brief` shall return the failure reason and leave any previously stored brief unchanged.
- **EC-6** `[client]` `must` IF a regeneration fails while a brief is stored, THEN the PR Brief block shall keep showing the stored brief and show the failure reason next to the refresh button.
- **EC-7** `[client]` `must` IF the first generation fails, THEN the PR Brief block shall show the failure reason under the "Generate brief" button.
- **EC-8** `[server]` `must` WHEN the API compares a model-proposed path with the PR and blast-map files, it shall strip one leading `./` and otherwise match case-sensitively and exactly.
- **EC-9** `[server]` `must` WHEN a second `POST /pulls/:id/brief` arrives for a PR whose generation is still running, the API shall make no second model call and return the running generation's result to both callers.
- **EC-10** `[server]` `must` IF the linked issue is referenced but cannot be fetched from GitHub, THEN the API shall generate the brief without it and list the issue in `missing_inputs`.

## Non-functional requirements

- **NFR-1** `[server]` `must` The model input for a brief shall contain no diff hunk bodies (no `pr_files.patch` text, no added or removed code lines).
- **NFR-2** `[server]` `must` The API shall pass PR title, description, linked-issue text, spec documents and blast-radius names to the model inside delimited untrusted-data blocks, under the same injection-guard rule the reviewer prompt uses.
- **NFR-3** `[client]` `must` The PR Brief block shall render model-written text (summary, risk titles and explanations, review-focus reasons) as plain text, never as HTML or executable markup.
- **NFR-4** `[server]` `must` `POST /pulls/:id/brief` shall be rate-limited like the other model-spending PR routes (10 requests per minute).
- **NFR-5** `[server]` `must` The API shall send at most 40,000 characters of facts to the model per brief generation, with attached spec documents also within the Project Context caps.
- **NFR-6** `[server]` `must` The API shall store at most 8 risks and at most 10 review-focus items per brief, keeping the first ones in the model's order after validation.
- **NFR-7** `[client]` `must` Each risk's severity shall have a text equivalent (for example the accessible name "High risk") in addition to its icon colour.
- **NFR-8** `[client]` `must` Review-focus items, the Generate button and the refresh button shall be operable with the keyboard alone, with visible focus.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| AC-5 | PR files `src/middleware/ratelimit.ts`, `src/config.ts`, `package.json`; blast callers `src/server.ts`, `src/api/public/index.ts`; model risks "Live Stripe key committed" on `src/config.ts:12`, "Limiter wraps server bootstrap" on `src/server.ts:88`, "Redis pool exhaustion" on `src/lib/redis-pool.ts` | the brief is stored | the first two risks remain; "Redis pool exhaustion" is gone |
| AC-6 | same PR; model review focus `src/config.ts:12 — live Stripe key (sk_live_…) committed in plaintext`, `./src/middleware/ratelimit.ts:52 — 429 branch omits Retry-After`, `src/utils/retry.ts:3 — retries on 429` | the brief is stored | the first item remains; the second remains as `src/middleware/ratelimit.ts:52` (EC-8); `src/utils/retry.ts` is gone |
| AC-26 | PR file `src/config.ts`; model risk "Secrets in config" with refs `src/config.ts:12` and `src/secrets/vault.ts:4` | the brief is stored | the risk remains with only the `src/config.ts:12` ref |
| AC-10 | brief stored for head `9f1c2ab` | the user reloads the PR page | `GET /pulls/:id/brief` returns that brief and the model provider records zero calls |
| AC-20 | repository not indexed (blast `degraded: true`, `reason: "no_data"`), no `pr_intent` row, PR body says "Fixes #77" and issue #77 returns 404 | the user clicks "Generate brief" | a brief with a summary is returned; `missing_inputs` names intent, blast radius (`no_data`) and issue #77 |
| NFR-1 | PR file `src/config.ts` patch adds `stripeKey: "sk_live_51H8xq…"` | the brief input is built | the input contains `src/config.ts`, `+4 -0` and no `sk_live_` text |

## Traceability and verification

| ID | Source | Verification hint |
|---|---|---|
| AC-1 | frame `specs/images/spec-0002/overview-pr-brief.png`; D-17 | client RTL test on block order; manual: compare with the frame |
| AC-2 | brief acceptance "with no brief, a Generate brief button is visible" | client RTL test with an empty brief fixture |
| AC-3 | brief "model is called exactly once", "model from the `risk_brief` setting"; D-15 | server `*.it.test.ts` counting mock LLM calls and asserting the resolved model |
| AC-4 | brief "Server assembles input: intent, blast-radius summary, diff stats, PR description, linked issue and attached specs"; D-7; D-8 | server unit test on the input builder |
| AC-5 | brief "drop risks … whose files are in neither the PR nor the blast-radius map" | server unit test (Examples row AC-5) |
| AC-6 | brief "drop … review-focus items whose files are in neither the PR nor the blast-radius map" | server unit test (Examples row AC-6) |
| AC-7 | brief "Add `summary` and `review_focus`"; D-3; D-6 | server contract test; diff of the two `brief.ts` copies |
| AC-8 | D-2 | server contract test; diff of the two `brief.ts` copies |
| AC-9 | brief "store result in `pr_brief` with the commit SHA" | server `*.it.test.ts` reading the `pr_brief` row |
| AC-10 | brief "Reopening the same PR state reads the cache and does not call the model" | server `*.it.test.ts` (Examples row AC-10) |
| AC-11 | brief "Only the summary is mandatory"; frame `specs/images/spec-0002/overview-summary-banner-annotated.png` | client RTL test |
| AC-12 | D-5; D-19; frame `specs/images/spec-0002/overview-summary-banner-annotated.png` | client RTL test with a review fixture |
| AC-13 | D-5 | client RTL test with no reviews |
| AC-14 | D-6; frame `specs/images/spec-0002/overview-pr-brief.png` | client RTL test with null cost and null tokens |
| AC-15 | brief "Risk areas — risks from the brief, icon colour shows severity"; D-2; frame `specs/images/spec-0002/overview-risks-focus-annotated.png` | client RTL test |
| AC-16 | brief "list of `file:line — reason` in recommended reading order"; frame `specs/images/spec-0002/overview-risks-focus-annotated.png` | client RTL test on item order and count |
| AC-17 | brief "Clicking a Review focus item opens Files changed at that file"; D-10; frame `specs/images/spec-0002/files-changed-target.png` | client RTL test on the URL and expanded card; manual: click a docs-role file |
| AC-18 | D-9; D-22 | client RTL test on the link `href` and `target` |
| AC-19 | brief "Intent and Blast radius … just place them alongside"; frame `specs/images/spec-0002/overview-pr-brief.png` | client RTL test |
| AC-20 | brief "brief is still generated and explicitly says which data is missing"; D-8 | server `*.it.test.ts` (Examples row AC-20) |
| AC-21 | brief acceptance "explicitly says which data is missing" | client RTL test with a missing-inputs fixture |
| AC-22 | brief "Click a refresh button to regenerate the brief"; frame `specs/images/spec-0002/overview-pr-brief.png` | client RTL test |
| AC-23 | brief "Click Generate brief, wait for generation" | client RTL test with a pending mutation |
| AC-24 | D-4 | client RTL test with a mismatched head SHA |
| AC-25 | D-1; D-2 | server `*.it.test.ts` expecting 404; client RTL test on the Intent block |
| AC-26 | D-20 | server unit test (Examples row AC-26) |
| AC-27 | D-21 | client RTL test on the URL and expanded card |
| AC-28 | D-21; D-22 | client RTL test on the link `href` and `target` |
| EC-1 | `client/INSIGHTS.md` 2026-09-27 (degraded blast hides the reason) | server unit test with a degraded blast fixture |
| EC-2 | `brief.noRisks` in `client/messages/en/brief.json`; design-gap analysis (empty state) | client RTL test |
| EC-3 | design-gap analysis (empty state) | client RTL test |
| EC-4 | `server/INSIGHTS.md` 2026-09-27 (lazy port hides `ConfigError`) | server `*.it.test.ts` with `secrets.get` returning undefined |
| EC-5 | D-11; brief "`completeStructured` validates with Zod and re-asks on bad JSON" | server `*.it.test.ts` with a failing mock provider |
| EC-6 | D-11 | client RTL test with a failing mutation and a stored brief |
| EC-7 | D-11 | client RTL test with a failing mutation and no brief |
| EC-8 | D-12 | server unit test (Examples row AC-6) |
| EC-9 | D-14 | server `*.it.test.ts` firing two requests |
| EC-10 | D-8 | server `*.it.test.ts` with a failing issue fetch (Examples row AC-20) |
| NFR-1 | brief "Do NOT pass diff hunk bodies to the model" | server unit test (Examples row NFR-1) |
| NFR-2 | `server/AGENTS.md` Gotchas (one shared injection guard) | server unit test on the built messages |
| NFR-3 | design-gap analysis (model output is untrusted) | client RTL test rendering `<script>` in a reason |
| NFR-4 | `server/AGENTS.md` (tighter caps on expensive routes; `/intent/derive` precedent) | server `*.it.test.ts` |
| NFR-5 | D-13; D-7 | server unit test on the input length |
| NFR-6 | D-13 | server unit test with 12 risks and 15 items |
| NFR-7 | D-16 | client RTL test on accessible names |
| NFR-8 | D-16 | client RTL test with keyboard events; manual: tab through the block |

## Decisions

- **D-1** Model risks vs the existing deterministic Risk Areas? → replace; the brief's risks take the Risk areas slot and the deterministic list leaves the Overview (accepted).
- **D-2** Risk contract? → delete the deterministic scanner entirely (`GET /pulls/:id/risks`, `PrRisks`, detectors, client wiring); `Risk` becomes `{ kind (free text), title, explanation, severity, file_refs[{ file, start_line?, end_line? }] }`, used only by the brief (user: "old one implementation was wrong").
- **D-3** `PrBrief` shape? → model output plus metadata (summary, risks, review_focus, generated_for_sha, generated_at, missing_inputs); Intent and Blast keep their own routes; `history` dropped.
- **D-4** Head SHA changed after generation? → "Stale — regenerate" badge; no automatic regeneration (declined auto-regenerate).
- **D-5** Verdict/score banner? → yes, reuse the existing verdict banner with the latest review's verdict and score and the brief summary as its text; summary alone when no review exists.
- **D-6** Cost line? → show the generation's cost and tokens; unknown cost "—" (accepted default).
- **D-7** Which specs? → documents attached to the workspace's enabled agents and their skills, within Project Context caps.
- **D-8** Linked issue? → the Intent Layer's issue reference, fetched from GitHub; a failure is listed as a missing input.
- **D-9** Review-focus item on a blast-map-only file? → link to the GitHub blob at that line in a new tab.
- **D-10** Scroll to the cited line on Files changed? → no, scroll to the file only (accepted default).
- **D-11** Model failure? → keep the old brief and show the reason near refresh; with no brief, show the reason under Generate brief.
- **D-12** Path matching? → strip a leading `./`, otherwise exact and case-sensitive (accepted default).
- **D-13** Limits? → 40,000 characters of facts; at most 8 risks and 10 review-focus items (accepted default).
- **D-14** Concurrent generate requests? → share one generation (accepted default).
- **D-15** Derive a missing intent first? → no; exactly one model call (accepted default).
- **D-16** Accessibility? → severity text equivalent and keyboard operation with visible focus (accepted default).
- **D-17** Layout? → banner → Intent | Blast radius → Risk areas → Review focus, PR description below (accepted default).
- **D-18** Owner module? → `server` (accepted default).
- **D-19** Which review feeds the banner? → the single most recent completed review, as on the Agent runs tab.
- **D-20** Risk with some invalid refs? → keep the risk, drop the bad refs; drop the risk only when no ref is valid.
- **D-21** Where does a risk's file ref lead? → same as Review focus: PR file → Files changed, blast-only file → GitHub blob link.
- **D-22** Commit for a blast-only GitHub link? → the blast radius `indexed_sha`, falling back to the PR head SHA (Blast radius card's existing rule).

## Inputs and provenance

- `pr_intent` row (Intent Layer, L03) — produced by this app; may be absent.
- `GET /pulls/:id/blast` (`BlastRadius.summary`, caller files from
  `downstream[].callers[].file`, symbol files) — repo-intel index; may be
  degraded.
- `GET /pulls/:id` `files[]` (path, additions, deletions) and Smart Diff
  roles — from `pr_files`; patch text is read by the app but never sent.
- PR title and description — GitHub, stored on the PR row.
- Linked issue — the issue reference the Intent Layer extracts from the PR
  title/body, fetched from GitHub (D-8); `PrDetail.linked_issue` is never
  filled today.
- Attached specs — Project Context documents (SPEC-0001) attached to the
  workspace's enabled agents and their skills (D-7).
- Latest completed review (verdict, findings, blockers, score) — `reviews`
  and `findings` rows (D-5).
- Model output — external, untrusted.
- Stored brief — the existing `pr_brief` table (`pr_id`, `json`); the commit
  SHA lives inside the JSON (brief).
- Disagreements resolved: the brief names `resolveFeatureModel(...)`; that
  free function no longer exists — the feature model resolves through
  `container.featureModels` (`server/INSIGHTS.md` 2026-09-29). The brief
  describes `Risk` with free `kind` and `file_refs[]`, while the current
  contract has the `RiskKind` enum and `refs[]` from the deterministic
  scanner; the user chose the brief's shape and removal of the scanner (D-2).

## Untrusted inputs

- PR title, PR description, linked-issue title/body and spec document text:
  sent to the model only inside delimited untrusted-data blocks (NFR-2);
  instructions in them are ignored.
- Blast-radius symbol and file names come from repository content: sent as
  data, rendered as plain text.
- Model output (summary, risk kinds/titles/explanations, reasons, file
  paths, line numbers): schema-validated; file paths are kept only when they
  match a known PR or blast-map file (AC-5, AC-6, EC-8) and are never used to
  read the filesystem; GitHub links are built only from validated paths and
  integer lines; text is rendered as plain text (NFR-3); nothing is executed.
- Diff hunk bodies: never sent to the model (NFR-1), so a secret committed in
  the diff cannot reach the provider through the brief.

## Open questions

None.
