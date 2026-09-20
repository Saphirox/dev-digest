# Development Plan — Intent card redesign + Risk Areas

**Status:** ready
**Citations valid as of:** `5fd80ec` (dirty tree — the whole Intent Layer of `docs/plans/0002-intent-layer.md` is uncommitted in `client/`, `server/`, `reviewer-core/`)

## Goal

Redesign the shipped `<IntentCard>` to match the reference design (highlighted `INTENT` chip, colour-coded scope columns, no confidence readout) and add a `RISK AREAS` section inside the same card, fed by a **deterministic, diff-grounded** risk scan behind a new `GET /pulls/:id/risks`.

**Acceptance** (tied to the four gaps):
1. The card header shows a highlighted `INTENT` chip (amber `--warn`/`--warn-bg`), not the `DERIVED INTENT` `SectionLabel`.
2. `✓ IN SCOPE` renders green (`--ok`) with a `Check` icon; `✕ OUT OF SCOPE` renders muted with an `X` icon and its bullets are visually dimmed relative to the in-scope ones; both are small dot-prefixed lines.
3. No confidence percentage is rendered anywhere on the card; `confidence` still exists in the contract, the `pr_intent.confidence` column, `clampConfidence`, the `intent: … confidence=…` log line and the `GET /pulls/:id/intent` payload, and it is still exposed on the card to assistive tech via the chip's `aria-label`.
4. A `⚠ RISK AREAS` section sits below the scope columns: one bordered pill per risk with a kind glyph, a bold title, a monospace `path:line` link, and a per-row chevron that expands the explanation. Every rendered `path:line` is a line that really appears on the new side of this PR's diff.
5. The stale badge, re-derive button, empty state and `missing_context` block still work; `pnpm arch:check` stays at 0 errors / ≤27 warnings; no migration is added.

## USER OVERRIDE for this iteration

- **Step 9 (Tests) is NOT executed.** No new test files are written in this iteration.
- If an EXISTING test breaks because of this redesign, fix it minimally and report it as a deviation. In particular `IntentCard.test.tsx` mocks `@/lib/hooks`; once the card mounts `<RiskAreas>`, that mock must also provide `usePrRisks` or the suite crashes. That is maintenance of the existing suite, not new test coverage.
- All existing checks still run in full (typecheck ×3, `arch:check`, all three test suites; Docker is up so skipped must be 0).

## Out of scope

- Any change to intent derivation, the intent prompt, `scope-filter.ts`, the review run, or `reviewer-core`'s prompt slots. Risks do **not** enter the reviewer prompt (follow-up).
- Any write to `pr_brief`, any schema change, any migration (see *The risk-source decision*).
- Settings UI — `risk_brief` is already in `FEATURE_MODELS` on both sides and `SettingsModels.tsx` renders it; this plan leaves that entry deliberately unconsumed.
- Removing `confidence` from the contract/DB/clamp/logs; touching `server/test/intent-helpers.test.ts`'s or `intent-service.test.ts`'s confidence assertions.
- e2e, architecture review, security review, commits, pushes.

## Context

- **INSIGHTS applied:**
  - `client/INSIGHTS.md` — reuse `SEV[x].c`/`SEV[x].icon` tokens rather than the baked-chrome components (`vendor/ui/primitives/tokens.ts:6`); no popover/tooltip primitive exists (the chevron must be a real expand, not a hover card); `title` on a non-interactive element gives a help cursor → **name things with `aria-label`, never `title`**; never `?? 0` a nullable metric; no `useEffectEvent`; `import type` only from `@devdigest/shared` or `next dev` 500s.
  - `server/INSIGHTS.md` — grep the whole vendored barrel for a new contract name before adding it (the `PrIntentRecord` TS2308 collision); `client/src/vendor/shared/contracts/platform.ts` is a *full duplicate*, so diff after any `platform.ts` edit (this plan does not edit it — confirm it stays byte-identical); `*.it.test.ts` green exit ≠ green, check the skipped count; arch baseline 0 errors / 27 warnings (currently 26).
  - Root `INSIGHTS.md` — `pnpm <script>` can die with `ERR_PNPM_IGNORED_BUILDS` → run `./node_modules/.bin/…`; pnpm scaffolds stray `pnpm-workspace.yaml` files; re-read files right before editing, the worktree is shared.
- **History:** `docs/plans/0002-intent-layer.md` is the immediate predecessor and its code is uncommitted. `rg` confirms `Risk`/`Risks` (`…/contracts/brief.ts:84-99`, identical line numbers on both vendored copies), `prBrief` (`server/src/db/schema/reviews.ts:70`) and `risk_brief` (`…/contracts/platform.ts:59`, `client/src/lib/feature-models.ts:29`) have **zero** consumers anywhere in `server/src`, `client/src` or `reviewer-core/src`. No reverted risk-brief commit exists.
- **Assumptions:** the design crop is authoritative for layout only; copy wording is the planner's (see *Open questions*). Risk titles/explanations are server-produced **data** (like `finding.title`) and are therefore not i18n keys — only the section chrome is.

## The risk-source decision (resolved)

**Chosen: (b) deterministic derivation in code from the diff — no model call.**

| Option | Grounding guarantee | Cost / latency | Verdict |
|---|---|---|---|
| (a) second cheap call on `risk_brief` → `pr_brief` | Model *proposes* `file_refs`; every ref must then be validated against the diff and silently dropped, so a row can vanish or arrive ungrounded | One extra `gpt-4.1` call per PR page (the registry default), seconds of latency, real money on a read | Rejected for this phase |
| (b) deterministic detectors over the diff | **By construction**: a ref only exists because a detector matched an added line and kept that line's new-side number | Zero model cost; one `loadDiff` per read | **Chosen** |
| (c) extend the intent classifier's schema | Impossible without breaking the Intent Layer's central invariant — the classifier is deliberately fed hunk headers only, never `+`/`-` lines (`intent/helpers.ts:26`, guarded by the `sk_live_SENTINEL` test). Detecting `New dependency: ioredis` requires reading the added line | Rejected on that alone |

How (b) guarantees the design's `path:line`: a new pure helper `addedLines(diff.raw)` re-scans the raw diff (the same technique `hunkHeaders` already uses, because `parseUnifiedDiff` throws away line text) and yields `{ path, line, text }` for every `+` line with its new-side number. Detectors may only emit refs built from those tuples; a final `groundRisks()` pass then re-checks every ref against `buildLineIndex(diff)` from `reviewer-core` — the same index `groundFindings` uses — and drops any ref that does not intersect a real hunk, and any risk left with no refs. **When nothing matches**, the section renders an explicit "No risk areas detected in this diff." line; nothing is invented, exactly like the Intent Layer's missing-context rule. When the diff came from truncated `pr_files.patch` fragments the scan simply finds less and degrades to that same line.

**Cost/latency consequence:** none on the model side. The cost is one `loadDiff` per Overview-tab load (a `git diff` subprocess, falling back to a DB read) — cached by React Query per `prId`, and the card only mounts on the Overview tab. Flagged under *Risks*.

**Why not persist to `pr_brief`:** it is keyed `pr_id` + a single `json` column with no sha column, so it offers no freshness key; and half-filling it with `{risks}` corrupts the composed `PrBrief` shape (`{intent, blast, risks, history}`) that a later lesson owns. Deterministic derivation makes the cache unnecessary. `pr_brief` and `risk_brief` stay untouched and are the documented seam for a phase-2 model-assisted pass.

## Modules & files

### server
- `src/vendor/shared/contracts/brief.ts:84-99` — add `RiskKind`, `RiskRef`; tighten `Risk.kind` to `RiskKind`; replace `Risk.file_refs: string[]` with `refs: RiskRef[]`; add `PrRisks`.
- `src/modules/reviews/risks/constants.ts` — new: path/pattern tables + caps.
- `src/modules/reviews/risks/helpers.ts` — new: `addedLines`, `toRanges` (pure).
- `src/modules/reviews/risks/detectors.ts` — new: the three detectors + `deriveRisks(diff)` + `groundRisks(risks, diff)`.
- `src/modules/reviews/risks/index.ts` — new: re-export `deriveRisks`.
- `src/modules/reviews/service.ts:232` — new `getRisks(workspaceId, prId, logger?)` beside `getIntent`.
- `src/modules/reviews/routes.ts:17,160` — `GET /pulls/:id/risks` + the plugin doc comment.

### client
- `src/vendor/shared/contracts/brief.ts` — mirror the server contract edit deliberately.
- `src/lib/hooks/risks.ts` (new) + `src/lib/hooks/index.ts` (one export line).
- `_components/IntentCard/IntentCard.tsx` + `styles.ts` — chip header, colour-coded columns, confidence removed, `<RiskAreas>` mounted, two new props.
- `_components/IntentCard/_components/RiskAreas/{RiskAreas.tsx,RiskRow.tsx,constants.ts,helpers.ts,styles.ts,index.ts}` — new.
- `src/app/repos/[repoId]/pulls/[number]/page.tsx:137` — pass `repoFullName` (already computed at `:83`) to `<IntentCard>`.
- `messages/en/intent.json` — chip + aria + `risks.*` keys; drop the visible confidence keys.

### reviewer-core
- `src/index.ts:23` — also export `buildLineIndex` (already exported from `src/grounding.ts:24`, just not in the barrel — same one-line precedent as `scoreFromFindings`).

## Component map

| Module | Component | Status | Layer | Path | Depends on | Step |
|---|---|---|---|---|---|---|
| shared | `RiskKind` / `RiskRef` / `PrRisks` | new | contract | `server/src/vendor/shared/contracts/brief.ts` | `RiskSeverity` | 1 |
| shared | `Risk` (`kind` narrowed, `file_refs`→`refs`) | changed | contract | same | `RiskKind`, `RiskRef` | 1 |
| client | vendored `brief.ts` mirror | changed | contract | `client/src/vendor/shared/contracts/brief.ts` | step 1 | 2 |
| reviewer-core | `buildLineIndex` barrel export | changed | domain | `reviewer-core/src/index.ts` | — | 3 |
| server | risk constants | new | domain | `server/src/modules/reviews/risks/constants.ts` | — | 4 |
| server | `addedLines` / `toRanges` | new | domain | `…/risks/helpers.ts` | — | 4 |
| server | `deriveRisks` / `groundRisks` + 3 detectors | new | domain | `…/risks/detectors.ts` | helpers, constants, `buildLineIndex` | 4 |
| server | `ReviewService.getRisks` | changed | service | `server/src/modules/reviews/service.ts` | `deriveRisks`, `loadDiff` | 5 |
| server | `GET /pulls/:id/risks` | changed | route | `server/src/modules/reviews/routes.ts` | `getRisks` | 5 |
| client | `usePrRisks` | new | hook | `client/src/lib/hooks/risks.ts` | step 5 | 6 |
| client | `<IntentCard>` (chip, columns, no confidence) | changed | `_components` | `…/_components/IntentCard/IntentCard.tsx` | `usePrIntent` | 7 |
| client | `<RiskAreas>` | new | `_components` | `…/IntentCard/_components/RiskAreas/RiskAreas.tsx` | `usePrRisks` | 8 |
| client | `<RiskRow>` | new | `_components` | `…/RiskAreas/RiskRow.tsx` | `MonoLink`, `IconBtn` | 8 |
| client | `RISK_ICON` map | new | constants | `…/RiskAreas/constants.ts` | `RiskKind` | 8 |
| client | `formatRef` | new | helpers | `…/RiskAreas/helpers.ts` | `RiskRef` | 8 |
| client | PR detail page (`repoFullName` prop) | changed | page | `…/pulls/[number]/page.tsx` | `<IntentCard>` | 8 |
| client | `intent` i18n namespace | changed | — | `client/messages/en/intent.json` | — | 7, 8 |

## Steps

1. **Risk contracts (canonical copy)** (module: `server`; depends on: —)
   - Change: in `contracts/brief.ts`, **first run `rg -n '\b(RiskKind|RiskRef|PrRisks)\b' server/src/vendor/shared client/src/vendor/shared`** (the `PrIntentRecord` TS2308 barrel-collision lesson) — all three must be absent. Then add `RiskKind = z.enum(['auth_surface','new_dependency','performance'])` and `RiskRef = z.object({ file, start_line: z.number().int(), end_line: z.number().int() })`; change `Risk.kind` from `z.string()` to `RiskKind` and replace `file_refs: z.array(z.string())` with `refs: z.array(RiskRef)`; add `PrRisks = z.object({ pr_id, derived_for_sha, risks: z.array(Risk), scanned: z.object({ files: z.number().int(), added_lines: z.number().int() }) })`. Every schema and its `z.infer` type share one name. `PrBrief.risks` keeps referencing `Risks` and still type-checks. Narrowing `kind` and structuring the refs is safe because `rg` shows zero consumers; the reason to structure rather than encode `"path:12-18"` in a string is that the client must build `githubBlobUrl(repoFullName, sha, file, start, end)` — it must not re-parse a path out of a display string.
   - Files: `server/src/vendor/shared/contracts/brief.ts`
   - Skills: `zod`
   - Verify: `pnpm typecheck` in `server/`

2. **Mirror into the client copy** (module: `client`; depends on: 1)
   - Change: apply the identical edit to `client/src/vendor/shared/contracts/brief.ts` (the two files are currently in sync at lines 84-99). Afterwards `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` must show only the pre-existing comment-wording differences, and `diff` of the two `platform.ts` files must stay empty.
   - Files: `client/src/vendor/shared/contracts/brief.ts`
   - Skills: `zod`
   - Verify: `pnpm typecheck` in `client/`

3. **Export `buildLineIndex` from reviewer-core** (module: `reviewer-core`; depends on: —)
   - Change: add `buildLineIndex` to the `./grounding.js` export line in `src/index.ts:23` with a one-line comment saying the server's risk grounding reuses the citation index. No other change; the package stays pure (no DB/fs/GitHub).
   - Files: `reviewer-core/src/index.ts`
   - Skills: `onion-architecture`
   - Verify: `npm run typecheck` in `reviewer-core/`

4. **Deterministic risk detectors (pure domain)** (module: `server`; depends on: 1, 3)
   - Change: new folder `server/src/modules/reviews/risks/` — inside `modules/reviews/` for the same reason the intent code is (`no-cross-module-internals` is an **error** rule and `ReviewService` calls this directly).
     - `constants.ts`: `AUTH_PATH_RE` (`auth|authn|authz|middleware|session|token|permission|rbac|login|oauth|jwt` as a path segment), `REQUEST_PATH_RE` (`routes?|middleware|handlers?|controllers?|api`), `MANIFEST_BASENAMES = ['package.json']`, `DEP_LINE_RE` (`"name": "range"`), `NON_DEP_KEYS` (`version`, `node`, `name`, …), `PERF_PATTERNS` (`{ label: 'Redis', re: /\b(new Redis\(|createClient\(|ioredis)/ }`, `{ label: 'HTTP', re: /\b(fetch\(|axios\.|got\(|http\.request\()/ }`), `MAX_RISKS = 8`, `MAX_REFS_PER_RISK = 5`, `MAX_SCAN_LINES = 20000`.
     - `helpers.ts` (pure — `pure-module-files-no-io` forbids Fastify/Drizzle/adapters/container here): `addedLines(raw, opts)` re-scans `diff.raw` exactly as `intent/helpers.ts`'s `hunkHeaders` does (track `+++ b/<path>`, reset a new-side cursor at each `@@ -a,b +c,d @@`, advance it on `+` and context lines, not on `-`) returning `{ path, line, text }[]` capped at `MAX_SCAN_LINES`; `toRanges(lines: number[]) → {start,end}[]` collapsing consecutive numbers into the `12-18` ranges the design shows.
     - `detectors.ts`: `deriveRisks(diff) → Risk[]`.
       - `auth_surface` — one aggregated risk when any added line lives in a file matching `AUTH_PATH_RE`; `severity: 'high'`; `title: 'Auth surface touched'`; refs = the added-line ranges of those files (capped).
       - `new_dependency` — one risk **per** dependency: an added line in a `package.json` matching `DEP_LINE_RE` whose key is not in `NON_DEP_KEYS` and whose key does **not** also appear on a removed (`-`) line of the same file (that is a version bump, not a new dep); `severity: 'medium'`; `title: 'New dependency: <name>'`; ref = that single line.
       - `performance` — one risk per (pattern label, file) where an added line matches a `PERF_PATTERNS` entry **and** the file matches `REQUEST_PATH_RE`; `severity: 'medium'`; `title: 'Adds <label> round-trip per request'`.
       - `explanation` is a deterministic sentence built from typed fields only (file path, line range, dependency name, pattern label). **Never embed the raw matched line** — a diff line can contain a secret (the repo already tests for `sk_live_SENTINEL` leakage).
       - `groundRisks(risks, diff)` — drop any ref whose `[start,end]` does not intersect `buildLineIndex(diff)` for that file, then drop any risk left with no refs; cap at `MAX_RISKS`. `deriveRisks` returns `groundRisks(...)`.
   - Files: `server/src/modules/reviews/risks/{constants.ts,helpers.ts,detectors.ts,index.ts}`
   - Skills: `onion-architecture`
   - Verify: `pnpm typecheck` and `pnpm arch:check` in `server/` (0 errors, warnings ≤ 27)

5. **Service method + API surface** (module: `server`; depends on: 4)
   - Change: `ReviewService.getRisks(workspaceId, prId, logger?: Logger): Promise<PrRisks>` beside `getIntent` (`service.ts:232`) — `getPull` (404 `NotFoundError` if missing) → `getRepo` → `loadDiff(...)` (the exact pattern `deriveIntent` uses at `:240-255`) → `deriveRisks(diff)` → return `{ pr_id, derived_for_sha: pull.headSha, risks, scanned: { files: diff.files.length, added_lines } }`. **Logged** once, via `logger?.info`: `risks: scanned <F> files / <A> added lines → <K> risk(s) [auth_surface×1, new_dependency×2]` — counts, file counts and detector names only; never a matched line's text, never a secret, never a token. Route: `app.get('/pulls/:id/risks', { schema: { params: IdParams } }, …)` returning `Promise<PrRisks>`, `getContext` for the workspace, handler at validate → one service call → return, **no** `drizzle-orm`/`src/db` import. No rate-limit config (it spends no money, unlike `/intent/derive`). No POST: the scan is deterministic and recomputed per read, so there is nothing to trigger. Extend the plugin doc comment at `routes.ts:17`.
   - Files: `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/routes.ts`
   - Skills: `fastify-best-practices`, `onion-architecture`
   - Verify: `pnpm arch:check` and `pnpm vitest run test/routes-smoke.test.ts` in `server/`

6. **Client hook** (module: `client`; depends on: 2, 5)
   - Change: `src/lib/hooks/risks.ts` — `usePrRisks(prId)` with `queryKey ["pr-risks", prId]`, `queryFn` calling `GET /pulls/<prId>/risks`, `enabled: !!prId`, modelled on `hooks/intent.ts`. `import type` only from `@devdigest/shared`. Add one `export * from "./risks";` line to `hooks/index.ts`.
   - Files: `client/src/lib/hooks/risks.ts`, `client/src/lib/hooks/index.ts`
   - Skills: `frontend-ui-architecture`
   - Verify: `pnpm typecheck` in `client/`

7. **IntentCard redesign — gaps 1, 2, 3** (module: `client`; depends on: 2)
   - Change: in `IntentCard.tsx`, replace the `SectionLabel` header with a local flex header row: on the left a `<Badge color="var(--warn)" bg="var(--warn-bg)">` holding `t("chip")` (rendered uppercase + letter-spaced via `styles.ts`, giving the marker-highlight look); on the right the existing stale `Badge` and the re-derive `Button` (keep `type="button"`, `loading`). The chip carries `aria-label` built from the confidence percentage — **`aria-label`, never `title`** (client INSIGHTS: a lone `title` on a non-interactive element gives a help cursor), and never `?? 0` the nullable confidence. **Delete the `s.confidence` block and its JSX entirely** — that is the whole of gap 3; `confidence` stays in the contract, the DB, `clampConfidence`, the `intent: … confidence=…` log line and the `GET /pulls/:id/intent` payload, and a curious user still sees it in the run Live Log / Run Trace. Columns: `IN SCOPE` heading gets an `Icon.Check` at `var(--ok)` and `color: var(--ok)`; `OUT OF SCOPE` gets an `Icon.X` at `var(--text-muted)` and stays muted; both lists become dot-prefixed rows (`listStyle: "none"`, a `•` span) with the out-of-scope items dimmed (`color: var(--text-muted)`, `opacity: .75`) relative to in-scope (`var(--text-secondary)`). Keep the intent sentence, the empty state and the `missing_context` block untouched. Add a `repoFullName: string | null` prop and keep `headSha`, for step 8. i18n: add `chip`, `chipAria`, `chipAriaUnknown`; remove `confidence`/`confidenceUnknown`.
   - Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/{IntentCard.tsx,styles.ts}`, `client/messages/en/intent.json`
   - Skills: `frontend-ui-architecture`, `react-best-practices`
   - Verify: `pnpm typecheck` in `client/`

8. **RiskAreas section — gap 4** (module: `client`; depends on: 6, 7)
   - Change: new nested folder `IntentCard/_components/RiskAreas/` (the repo already nests, e.g. `RunTraceDrawer/_components/TraceBody/`):
     - `constants.ts` — `RISK_ICON: Record<RiskKind, IconName> = { auth_surface: "Shield", new_dependency: "Boxes", performance: "Zap" }`. A local `Record<Union, …>` so `tsc` forces a new enum value to get a glyph; **no runtime import** of the zod enum (`RiskKind.options` would 500 `next dev`). Note: lucide has no `Package` in this registry — `Boxes` is the package glyph.
     - `helpers.ts` — `formatRef(ref)` → `"path:12-18"`, or `"path:34"` when `start_line === end_line`.
     - `RiskAreas.tsx` — `SectionLabel icon="AlertTriangle"` with `t("risks.title")`, then the rows. `isLoading` → render nothing (same as the card does). Empty `risks` → one muted line `t("risks.none")`. Query error → `t("risks.error")`, never a fabricated row.
     - `RiskRow.tsx` — a bordered pill (`1px solid var(--border)`, radius 8, padding): kind glyph via `Icon[RISK_ICON[risk.kind]]` tinted by severity (`SEV.CRITICAL.c` for `high`, `SEV.WARNING.c` for `medium`, `SEV.SUGGESTION.c` for `low` — a local `Record<RiskSeverity, string>`), a bold `risk.title`, the first ref beneath it as a `MonoLink` to `githubBlobUrl(repoFullName, headSha, ref.file, ref.start_line, ref.end_line)` (when `repoFullName` is null render plain mono text — no broken link), and on the right an `IconBtn` chevron whose `label` gives the accessible name RTL queries by. Expanded → `risk.explanation` plus the remaining refs. Expansion is **per row**, held as `useState<Set<string>>` in `RiskAreas` keyed by kind+title; derive `open` from that set, never mirror server data into state.
     - `styles.ts`, `index.ts`.
   - Mount `<RiskAreas prId={prId} headSha={headSha} repoFullName={repoFullName} />` inside the `<Card>` of `IntentCard`, below the scope columns and above the `missing_context` block, separated by the same `borderTop: 1px solid var(--border)` the removed confidence block used. Pass `repoFullName` from `page.tsx:137` (already computed at `:83`); the page stays thin.
   - i18n: add a `risks` subtree to `intent.json` (`title`, `none`, `error`, `expand`, `collapse`) — one namespace per feature area, and Risk Areas is part of the intent card. Risk titles/explanations arrive as data and are not translated (same treatment as `finding.title`).
   - Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/_components/RiskAreas/*`, `IntentCard.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/messages/en/intent.json`
   - Skills: `frontend-ui-architecture`, `react-best-practices`
   - Verify: `pnpm typecheck` in `client/`

9. **Tests — SKIPPED THIS ITERATION** (see *USER OVERRIDE*). The test designs below are retained for the follow-up iteration and must NOT be written now.
   - `server/test/risks-detectors.test.ts` (unit): sentinel non-leak into risk copy; `"ioredis": "^5.4.1"` added → one `new_dependency` risk with the real line number; a version bump → no risk; added lines in `src/middleware/ratelimit.ts` → one `auth_surface` risk over the contiguous block; `new Redis(` in a request-path file → `performance`, in `scripts/seed.ts` → none; empty/truncated diff → `risks: []`; every ref satisfies `buildLineIndex(diff).get(ref.file)!.has(ref.start_line)`.
   - `server/test/risks.it.test.ts` (DB-backed): `GET /pulls/:id/risks` → 200 with `derived_for_sha === pull.headSha`, refs matching `parseUnifiedDiff(RAW)`; uninteresting diff → `risks: []`; unknown id → 404.
   - `client/…/IntentCard.test.tsx` (changed): no `%` and no `/confidence/i` text anywhere; the chip's accessible name contains the percentage; `confidence: null` → unknown aria text and still no `%`; both scope headings render with their items.
   - `client/…/RiskAreas.test.tsx` (new): one row per risk; ref renders `src/middleware/ratelimit.ts:12-18` and links to `/blob/<headSha>/…#L12-L18`; single-line ref renders `package.json:34`; explanation hidden until the chevron is clicked, and expanding one row leaves the other collapsed; `risks: []` → the "no risk areas" line; `repoFullName: null` → text, no link role.

## Skills for implementer

| Step | Skill | Rule from the skill that governs this step |
|---|---|---|
| 1, 2 | `zod` | `schema-use-enums` — fixed string values become a `z.enum` (`RiskKind`), not `z.string()`; `type-export-schemas-and-types` — export the schema and its `z.infer` under one name |
| 3, 4, 5 | `onion-architecture` | Imports point inward; `pure-module-files-no-io` — `helpers.ts`/`constants.ts` must not import Fastify, Drizzle, `src/db`, adapters or the container; `routes-no-persistence` — no `drizzle-orm`/`src/db` in `routes.ts`; `no-cross-module-internals` is an **error**, so risk code lives inside `modules/reviews/`; `reviewer-core-pure` — the barrel export adds no dependency; `arch:check` 0 errors, warnings not above 27 |
| 5 | `fastify-best-practices` | Schema-first + encapsulation: declare `params` with the shared `IdParams`; the handler stays validate → one service call → return; throw `NotFoundError`, never touch `reply` in the service |
| 6, 7, 8 | `frontend-ui-architecture` | Placement table: a sub-component used by one parent goes in `<Parent>/_components/<Child>/`; a lookup table used by one component goes in its `constants.ts`; a pure formatting function goes in its `helpers.ts`; **user-facing text goes in i18n message files, never `constants.ts`**; `page.tsx` stays thin |
| 7, 8 | `react-best-practices` | Derive, don't store — compute `open` from the expansion `Set`, never mirror `usePrRisks` data into `useState`; stable `key` props; an icon-only control needs an accessible name; no `useEffectEvent` |

## Architecture constraints

- Risk derivation lives **inside** `modules/reviews/` (`no-cross-module-internals` is an `arch:check` error and `ReviewService` calls it directly). `pnpm arch:check` must stay 0 errors and must not exceed the 27-warning baseline (26 today).
- `risks/helpers.ts` and `risks/constants.ts` are pure: no Fastify, Drizzle, `src/db`, `src/adapters` or container import (`pure-module-files-no-io`). `detectors.ts` may import only those two plus `@devdigest/shared` and `@devdigest/reviewer-core`.
- `reviewer-core` gains one barrel export line and stays free of DB, fs, GitHub and `process.env`.
- The two vendored contract copies are edited deliberately, server first (step 1) then client (step 2), and diffed afterwards; `platform.ts` must stay byte-identical between them.
- **No schema change, no migration, no `pr_brief` write.** `pnpm db:migrate` is not run.
- Package managers: `server`/`client` pnpm, `reviewer-core` npm — never cross them; do not create new `pnpm-workspace.yaml` files.
- Nothing logged contains a raw diff line, a secret, a token or a key — only counts, file paths, detector names and extracted typed fields.

## Do-not-touch that this task hits

- `server/src/vendor/shared/**` + `client/src/vendor/shared/**` — sanctioned route: steps 1 and 2 edit both sides deliberately and diff them afterwards.
- Merged migrations under `server/src/db/migrations/` — not hit; this plan adds no migration by design.
- `client/src/vendor/ui/**` internals — off-limits from outside the barrel. Import `Badge`, `Card`, `MonoLink`, `IconBtn`, `SectionLabel`, `Icon`, `SEV` from `@devdigest/ui`; if a primitive is missing, build it locally in the `RiskAreas` folder rather than editing `vendor/ui`.
- Lock files, `e2e/specs/*.flow.json`, the `devdigest_pgdata` volume — untouched; no `pnpm install`, no `docker compose down -v`.

## Verification (whole task)

- `server/`: `pnpm typecheck` — clean; `pnpm arch:check` — 0 errors, warnings ≤ 27; `pnpm test` — all pass **and skipped == 0** (Docker is up, so a skip means it flaked; re-run).
- `client/`: `pnpm typecheck`, `pnpm test`. A pass does **not** prove the card renders — if `next dev` cannot be loaded, record the redesigned card under *Not verified*.
- `reviewer-core/`: `npm run typecheck`, `npm test`.
- `ERR_PNPM_IGNORED_BUILDS` ⇒ `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --output-type err`. Delete any stray untracked `pnpm-workspace.yaml` *you* create.
- No e2e run. Neither package has a `lint` script.

## Risks

- **Detector false positives.** `AUTH_PATH_RE` and `PERF_PATTERNS` are keyword heuristics; the Intent Layer's own scope filter shipped with exactly this bug (a stopword match dropped two real findings — `server/INSIGHTS.md`, 2026-09-20). Mitigations here: the `performance` detector needs **two** conditions (pattern + request-path file), `new_dependency` excludes version bumps, and a risk row is additive (it never hides anything). A false positive is a visible row — not silent data loss.
- **`loadDiff` on every Overview load.** `GET /pulls/:id/risks` shells out to `git diff` (or reads `pr_files`). React Query caches per `prId` and the card only mounts on the Overview tab, but on a large repo the first paint of the section will lag. If it bites, the follow-up is a `pr_brief`-backed cache keyed by head sha — deliberately not built now.
- **Truncated `pr_files` diffs** produce fewer added lines, so the scan under-reports. It degrades to "No risk areas detected", never to an invented row.
- **Contract narrowing.** `Risk.kind` becoming a 3-value enum means a future kind needs an enum value *and* a `RISK_ICON` row; `tsc` points at both.
- **Client contract drift.** The vendored copies differ in comment text; diff `brief.ts` (and `platform.ts`) after step 2.

## Open questions

*(none blocks a step — each has a default the implementer applies and records under Deviations)*

- **What does the chevron reveal?** Default: the full `explanation` plus any refs beyond the first.
- **Per-row or group collapse?** Default: per-row, all collapsed initially.
- **Is the `INTENT` chip a literal marker-highlight or a rounded badge?** No repo primitive draws a marker stroke. Default: `Badge` in `--warn`/`--warn-bg`.
- **What does "shadowed" mean for out-of-scope bullets?** Default: both a muted colour token and reduced opacity.
- **Should a risk ref link to GitHub or the in-app Diff tab?** Default: GitHub blob at the PR head sha, reusing `githubBlobUrl` as `FindingCard` does.
- **Is `confidence` wanted anywhere visible at all?** Default: no new surface; log line, trace, API payload and the chip's `aria-label`.

## Could not establish

- The design's exact typography/spacing — the crop was described, not supplied. Steps 7/8 reuse the card's existing scale (13.5/12.5/11px).
- Whether the design intends a severity treatment on risk rows at all — the crop shows a glyph per *kind*, not a severity badge. The plan tints the glyph by severity and shows no severity label; if the design shows none, drop the tint.
- Whether `git diff` is fast enough for a per-page-load call — not measurable read-only.
