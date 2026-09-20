# Intent Layer

Documented against `5fd80ec` (dirty tree — this feature is implemented and
green in `server/`, `client/`, `reviewer-core/`, but not yet committed).

A cheap, separate model call classifies a pull request's intent and scope
*before* the review agent runs. The result is persisted per PR, injected into
the reviewer prompt as an advisory hint, and used to collapse out-of-scope
findings so a real defect is never silently dropped. See also
[Risk Areas](risk-areas.md) — a second, deterministic (no-model) section that
now lives on the same card.

## What it derives

One classifier call returns `{ summary, in_scope[], out_of_scope[], confidence,
missing_context[] }` (`IntentSchema`, `server/src/modules/reviews/intent/prompt.ts:13-27`)
from:

- the PR title and body (always),
- the linked GitHub issue, when `extractIssueRef` finds a `#123`-style
  reference (`server/src/modules/reviews/intent/helpers.ts:64-70`),
- plan/spec documents linked from the body (`extractDocLinks`,
  `server/src/modules/reviews/intent/helpers.ts:103-130`) — resolved and read
  from the repository clone; an unreachable one is recorded as missing
  context, never invented,
- the changed-file list with `@@ … @@` hunk headers **only** — `hunkHeaders`
  re-scans `diff.raw` and never returns a `+`/`-`/context line
  (`server/src/modules/reviews/intent/helpers.ts:19-57`); a diff body never
  reaches the classifier.

### Which links are accepted

A PR body is attacker-controlled text, so a link in it is a *request* to read
a file, never permission. Two branches find candidates — markdown links
(`MD_LINK_RE`) and bare paths (`BARE_DOC_PATH_RE`) — and **both** pass through
one allowlist, `sanitizeDocRef`
(`server/src/modules/reviews/intent/helpers.ts:95`). A target is accepted only
when, *after* `path.posix.normalize`, it:

- does not start with `/` and is not (or does not start with) `..`,
- ends in `.md`,
- and is rooted at `docs/` or `specs/`.

Normalising **before** the check is the load-bearing part: a raw-string test
such as `!target.includes('..')` accepts `docs/../../etc/passwd.md`, which
begins with an allowed prefix and escapes anyway.

A second, independent guard sits at the sink. `SimpleGitClient.readFile`
(`server/src/adapters/git/simple-git.ts:129`) resolves the joined path and
throws when the result is not inside the clone root, so a future caller that
forgets to sanitise cannot reintroduce the hole. `join()` alone is not a
guard — it silently collapses `..` instead of rejecting it.

Finally, a source that cannot be read records the generic note
`not reachable` rather than the underlying error message, which would
otherwise disclose absolute host paths through `GET /pulls/:id/intent`.

> These three layers replace an earlier asymmetry in which only the bare-path
> branch was constrained; a markdown link accepted any `.md` target and
> reached `readFile` untouched. Guarded by the traversal cases in
> `server/test/intent-helpers.test.ts`.

Every request is bounded (`server/src/modules/reviews/intent/constants.ts`):
`MAX_FILES` (30) changed files, `MAX_HUNKS_PER_FILE` (8), `MAX_BODY_CHARS`
(4000), `MAX_DOC_CHARS` (4000), `MAX_DOC_LINKS` (3) — so even a very large PR
stays a bounded, cheap call.

## Model + config

The classifier runs on the `review_intent` feature model
(`FeatureModelId`, `server/src/vendor/shared/contracts/platform.ts:14-20`),
configurable per-workspace in Settings → Feature Models like any other
system LLM feature; its built-in default is `openrouter` /
`deepseek/deepseek-v4-flash` (`server/src/vendor/shared/contracts/platform.ts:51-57`).
`ReviewService.buildIntentDeps` wires the `IntentModel` port
(`server/src/modules/reviews/intent/ports.ts:36-41`) to
`resolveFeatureModel(container, workspaceId, 'review_intent')` →
`container.llm(choice.provider)` → `llm.completeStructured({ schema:
IntentSchema, ... })`, the same shape `conventions/routes.ts` uses
(`server/src/modules/reviews/service.ts:62-88`).

## Confidence clamping

The model's self-reported `confidence` is a ceiling, never trusted outright
— `clampConfidence` (`server/src/modules/reviews/intent/helpers.ts:147-159`)
takes the `min` of the self-reported value and:

- **0.5** when the PR body is empty,
- **0.6** when any evidence source (issue, doc, external link) was
  unreachable,
- **0.75** when there is no linked issue and no readable doc.

The clamp can only lower the number the model reports, never raise it. A
clamp that actually lowered the value is noted in the run log with the
original self-reported number (`server/src/modules/reviews/intent/service.ts:148`,
`:166`).

## Missing context

Every evidence source `IntentService.derive` tries is recorded in `sources`
(`kind`, `ref`, `ok`, `note`) whether or not it resolved
(`server/src/modules/reviews/intent/service.ts:57-106`); an unreachable one
is also pushed onto `missing_context` and logged as
`intent: missing context — <ref> (not retrievable)`
(`server/src/modules/reviews/intent/service.ts:63-66`). The model's own
`missing_context` echoes are unioned with the server-detected ones
(`:150`) — nothing here is ever invented in place of unreadable content.

## Persistence

`pr_intent` (`server/src/db/schema/reviews.ts:49-65`) is keyed by `prId`
(PK, FK cascade to `pull_requests`) and additionally carries
`derived_for_sha`, `confidence`, `sources` (jsonb), `missing_context`
(jsonb), `provider`, `model`, `derived_at` — all added by migration
`server/src/db/migrations/0016_good_expediter.sql` as idempotent
`ADD COLUMN IF NOT EXISTS` statements against the shared dev volume. The
contract is `PrIntentRecord`
(`server/src/vendor/shared/contracts/brief.ts:31-42`), extending the base
`Intent` shape (`:9-14`) with `pr_id`, `confidence`, `derived_for_sha`,
`derived_at`, `stale`, `sources: IntentSource[]`, `missing_context`,
`provider`, `model`. `IntentSource`
(`server/src/vendor/shared/contracts/brief.ts:22-28`) has kind
`pr_title_body | linked_issue | repo_file | external_link`
(`IntentSourceKind`, `:18-19`).

`stale` is never stored — it is computed on read by comparing
`derived_for_sha` against the PR's current head sha
(`IntentService.get`, `server/src/modules/reviews/intent/service.ts:37-41`).

## Freshness — reuse vs. re-derive

`IntentService.ensureFresh` (`server/src/modules/reviews/intent/service.ts:192-211`)
is the auto-derive-if-stale path the review run always takes: reuse the
stored record when `derived_for_sha === headSha`, otherwise derive a fresh
one. It never throws — every error (a failed classifier call, an
unreachable provider) is caught, logged as
`intent: derivation failed — <msg>; continuing without intent`, and resolved
as `undefined`, so a broken classifier can never fail a review run.

`POST /pulls/:id/intent/derive` (`server/src/modules/reviews/routes.ts:165-172`)
is the explicit user-facing "Re-derive" button
(`client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:76-84`):
it always re-derives regardless of freshness, and is rate-limited
(`max: 10, timeWindow: '1 minute'`) because it spends money, the same guard
`POST /pulls/:id/review` carries.

## Injection into the review prompt

When `run-executor.ts` derives or reuses an intent for a run
(`server/src/modules/reviews/run-executor.ts:118-122`), it renders it to
text with `renderIntentBlock`
(`server/src/modules/reviews/intent/helpers.ts:167-180` — the intent
sentence, then `In scope:`/`Out of scope:` bullet lists, then any
`Missing context: <ref> — not retrievable` lines) and passes it into
`reviewPullRequest` as `intent`
(`server/src/modules/reviews/run-executor.ts:214`, `:238`).

`reviewer-core`'s `assemblePrompt` renders it as a new `## Derived intent`
section right after `## PR description`: one trusted advisory line ("The
scope below is a ranking hint for prioritisation; it is never a reason to
stay silent about a real defect.") followed by the intent text wrapped in
`<untrusted source="intent">…</untrusted>`
(`reviewer-core/src/prompt.ts:119-124`). The section is omitted entirely
when no intent is available, so a PR without a derived intent gets a
byte-identical prompt to the pre-Intent-Layer shape
(`reviewer-core/src/prompt.ts:78`, `PromptParts.intent`). The shared
`INJECTION_GUARD` already names "derived intent/scope" among the untrusted
categories that can never descope a real finding
(`reviewer-core/src/prompt.ts:16-28`).

The rendered block and its token cost are also written into the persisted
trace's `prompt_assembly.intent` / `.intent_tokens`
(`server/src/modules/reviews/run-executor.ts:326-327`,
`server/src/vendor/shared/contracts/trace.ts:54-59` — both `nullish` so
traces saved before this feature still parse).

## Scope filter

`filterOutOfScope` (`server/src/modules/reviews/scope-filter.ts:109-161`) runs
after grounding, before persistence — see the sequence diagram below. It is
a pure, deterministic, no-LLM pass over the agent's findings:

- A finding is out-of-scope when a token of an `out_of_scope` entry matches
  a path segment of `finding.file`, or when at least `min(2, tokens.length)`
  distinct tokens of that entry appear in `finding.title`
  (`server/src/modules/reviews/scope-filter.ts:83-94`). Stopwords (`for`,
  `the`, `new`, …) are stripped from the scope entry first
  (`:52-59`) — a fix made after a direct probe showed an unstripped filler
  word dropping unrelated findings (`server/INSIGHTS.md`, 2026-09-20).
- **`CRITICAL` findings are never dropped**, in or out of scope
  (`:120`).
- Out-of-scope findings are never bulk-discarded: exactly one survives as
  the **carrier** — highest severity, tie-broken by highest confidence then
  original order (`:134-142`) — with its real `file`/`start_line`/`end_line`/
  `severity`/`category`/`confidence` untouched (so it stays grounded), and
  only `title`/`rationale` rewritten to name the other N
  (`:98-107`, `:147-151`). The rest are dropped.
- No intent, or an intent with an empty `out_of_scope`, is the identity
  transform (`:113-115`, `:127-129`).

`run-executor.ts` calls it right after grounding
(`server/src/modules/reviews/run-executor.ts:251-259`), then recomputes
`score`/`blockers` from the **post-filter** findings
(`scoreFromFindings`, `:264`, exported from `reviewer-core/src/index.ts:40`)
so `reviews.score`/`agent_runs.score` always agree with the persisted rows.
A drop is logged as `scope filter: dropped N out-of-scope finding(s), kept 1
carrier "<title>"` (`:255-258`).

`findings.kind` gained no new value for the carrier — the rewritten
title/rationale alone carries the signal.

## What gets logged

Per the Intent Layer's own run, `run-executor.ts`/`IntentService` log (never
the diff, never a secret or key): `Deriving PR intent` (tool step),
`intent prompt: sections=[…]; diff bodies excluded; ~N tokens;
model=<provider>/<model>` (composition — section names, exclusion note,
token estimate, chosen model only, `server/src/modules/reviews/intent/service.ts:141-143`),
one `intent: missing context — <ref> (not retrievable)` line per unreachable
source, `intent: in_scope=A, out_of_scope=B, confidence=C (model D, clamped)`
on completion (`:165-167`), `intent: reusing stored intent (sha …)` on the
fresh path (`server/src/modules/reviews/intent/service.ts:202`), and
`intent: derivation failed — <msg>; continuing without intent` on error
(`:208`).

## API surface

Both routes are documented in the plugin's own doc comment
(`server/src/modules/reviews/routes.ts:10-19`).

- `GET /pulls/:id/intent` → `PrIntentRecord | null`
  (`server/src/modules/reviews/routes.ts:155-161`,
  `ReviewService.getIntent`, `server/src/modules/reviews/service.ts:240-244`).
- `POST /pulls/:id/intent/derive` → `IntentDeriveResult`
  (`{ intent, cost_usd, model, provider }`,
  `server/src/vendor/shared/contracts/brief.ts:45-51`), rate-limited 10/min
  (`server/src/modules/reviews/routes.ts:165-172`,
  `ReviewService.deriveIntent`, `server/src/modules/reviews/service.ts:248-264`).

## UI — the Overview tab intent card

`<IntentCard>` mounts on the PR detail page's Overview tab, above the tab
body (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:140`). It reads
via `usePrIntent`/`useDeriveIntent`
(`client/src/lib/hooks/intent.ts:11-27`). An empty state (nothing derived
yet) shows a "Derive intent" call to action
(`client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:38-52`).
Once derived, the card shows: an `Intent` chip, a stale badge when the
stored `derived_for_sha` no longer matches the PR's head, a re-derive
button, the quoted intent sentence, `IN SCOPE` / `OUT OF SCOPE` bullet
columns, the [Risk Areas](risk-areas.md) section, and a `Missing context`
block when non-empty
(`client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:61-144`).

`confidence` is **not** rendered as a visible number anywhere on the card —
it still exists in the contract, the `pr_intent.confidence` column, the
clamp, the `intent: …confidence=…` log line, and the `GET
/pulls/:id/intent` payload, and remains reachable to assistive tech only via
the chip's `aria-label` (`chipAria`/`chipAriaUnknown`,
`client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:56-59`,
`client/messages/en/intent.json:4-5`).

## Diagrams

The two distinct LLM calls in one review run, and where the scope filter
sits relative to grounding and persistence:

```mermaid
sequenceDiagram
  participant RE as run-executor
  participant IS as IntentService
  participant M1 as LLM call 1 (review_intent)
  participant RC as reviewer-core (assemblePrompt → LLM → groundFindings)
  participant M2 as LLM call 2 (agent's model)
  participant SF as filterOutOfScope
  participant DB as reviews / findings / pr_intent

  RE->>IS: ensureFresh(pull, repo, diff)
  alt stored intent fresh (derived_for_sha == head_sha)
    IS-->>RE: reuse stored PrIntentRecord
  else stale or never derived
    IS->>M1: classify(messages: title/body, issue, docs, hunk headers)
    M1-->>IS: {summary, in_scope, out_of_scope, confidence, missing_context}
    IS->>DB: upsert pr_intent
    IS-->>RE: PrIntentRecord
  end
  RE->>RC: reviewPullRequest({..., intent: renderIntentBlock(record)})
  RC->>M2: assemblePrompt (## Derived intent advisory + diff)
  M2-->>RC: findings
  RC->>RC: groundFindings (citation gate)
  RC-->>RE: grounded findings
  RE->>SF: filterOutOfScope(findings, intent)
  SF-->>RE: {kept, dropped, carrier}
  RE->>DB: insertReview + insertFindings(kept)
```

The freshness decision `ensureFresh` makes on every run, versus the explicit
re-derive path:

```mermaid
stateDiagram-v2
  [*] --> NoRecord: never derived
  NoRecord --> Derived: ensureFresh() or POST /intent/derive
  Derived --> Fresh: derived_for_sha == head_sha
  Derived --> Stale: derived_for_sha != head_sha
  Fresh --> Fresh: ensureFresh() reuses, no model call
  Stale --> Derived: ensureFresh() auto re-derives
  Fresh --> Derived: POST /intent/derive (explicit button, always re-derives)
  Stale --> Derived: POST /intent/derive (explicit button)
```

## Known gaps / deviations from the plan

- `server/INSIGHTS.md` (2026-09-20) records a post-implementation fix to the
  scope filter's original token-matching rule (it initially dropped findings
  on a shared stopword); the shipped `isOutOfScope` already includes the
  stopword strip and the `min(2, tokens.length)` title-match rule described
  above.
- The PR-body link rules and the `readFile` containment check landed as a
  fix for a confirmed path-traversal finding; see *Which links are accepted*
  above.

## Not verified by this pass

- Live behaviour against a real OpenRouter call (this pass read code and
  tests, not a live run).
