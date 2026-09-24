# 0005 — Smart Diff UI fidelity

**Status:** ready · **Citations valid as of:** `59eb758` (dirty tree — plan 0004's work is
uncommitted; every path below is read from the working tree)

## Goal

Close eight UI-fidelity gaps between the running `SmartDiffViewer` and the target design,
client-side only. No server change, no contract change, no re-opening of any decision in
[0004-smart-diff.md](0004-smart-diff.md).

**Acceptance:** on PR #4 the empty `boilerplate` group renders nothing at all; each visible group
header is a single row `● Core logic · <blurb> · 5 files`; every flagged line ends in an icon+text
severity badge instead of a bare dot; `server/src/platform/rate-limit-metrics.ts` shows `✦ summary`
in its card header and `✦ What this does: exports recordRateLimited, rateLimitedSnapshot` as the
first row of its card body; the stat line renders `+135` green and `−16` red. On PR #1, `wiring`
and `boilerplate` files show no summary chip and no summary row even when the payload carries one.

## Out of scope

- **Gap 5 (hover popover on a line badge) — dropped by the user.** No `useHoverPreview`, no
  `FindingsPreviewCard`, no `Map<line, Finding[]>`. `SmartDiffViewer/helpers.ts` is **not changed
  by this plan** and keeps deriving only `Map<line, Severity>`.
  `client/src/components/findings-preview/**` is not touched.
- Any `server/**` change, including the smart-diff builder, the classifier and the
  `pseudocode_summary` computation — the server keeps emitting all three groups and keeps
  computing summaries for every role.
- Any edit to `server/src/vendor/shared/**` or `client/src/vendor/shared/**`, any migration, any
  lock file, any `e2e/specs/*.flow.json`.
- Writing tests — a separate `test-writer` agent runs after (see *Handed to test-writer*).
- Moving the red dot / findings badge off its current row above the card (see *Open questions*).
- Renaming the `Severity` enum, the contract, or `@devdigest/ui`'s `SEV` map.
- Committing, pushing, architecture review, security review.

## Context

**INSIGHTS applied** (`client/INSIGHTS.md`; root not needed — no `scripts/`, Docker, CI or
`.claude/` change):

- 2026-09-17 *"Reuse vendor/ui's tokens before its components"* — `SEV[x].c` / `SEV[x].bg` /
  `SEV[x].icon` are the right source for the per-line badge; `SeverityBadge` bakes in a fixed pill
  and has no variant prop, so the badge stays local. Directly governs gap 3.
- 2026-09-18 *"@devdigest/ui exports its own `Severity` with a fourth value"* — type props from the
  **contract** `Severity`; never import both in one file.
- 2026-09-20 *"`Badge` silently drops `aria-label`"* — the new badge is a plain `<span>` with
  **visible text**, so it needs no `aria-label` at all; drop today's `aria-hidden="true"`.
- 2026-09-20 *"`React.useEffectEvent` crashes in the browser"* — no new effects need it.
- 2026-09-19 *"runtime import of a vendored contract 500s the page"* — `SmartDiffRole` stays
  `import type` in `constants.ts`.
- 2026-09-20 *"curl'ing SSR HTML to check a client-fetched feature is a false positive"* —
  next-intl serialises the whole `smartDiff` namespace into the flight payload, so grepping the
  HTML for `"Core logic"` or `"critical"` proves nothing. Governs *Verification*.
- 2026-09-20 *"a text-only design description is not a literal component"* — why gap 9 is a
  verify-only step, not a speculative restyle.

**Live diagnosis of gap 4 (done during planning, against the running API on :3001):**

`GET /pulls/cb34a2da-…/reviews` returns two reviews, **both from the same `agent_id`
`917cf657-…`**. `latestFindingsPerAgent` (`SmartDiffViewer/helpers.ts:25`) correctly keeps only the
newer one, whose four findings are: CRITICAL `app.ts:91-109`, WARNING `app.ts:103-107`, WARNING
`app.ts:110-112`, CRITICAL `rate-limit.test.ts:44-46`. The older review holds the PR's only two
`SUGGESTION` findings and is correctly excluded.

**Finding: (a) — there is no bug.** Amber *does* render, on exactly 3 of 22 lines (`110`, `111`,
`112`); the other 19 are red because the enclosing CRITICAL `91-109` legitimately wins on
`103-107`. Blue never appears because the latest-per-agent review contains **zero SUGGESTION
findings** — a data property of PR #4, not a rendering fault. The complaint is the missing text
labels of gap 3: at 8 px, a 3-of-22 amber dot among red dots is invisible. **Do not touch
worst-severity-wins, `latestFindingsPerAgent`, or `severityForFlaggedLines`.**

**Assumptions:**

- "Blue/accent" for the Core dot means `var(--accent)`; "amber/warn" means `var(--warn)`; "muted
  grey" means `var(--text-muted)` (`client/src/vendor/ui/styles.css:19-30`).
- The design's lowercase `critical` / `warning` / `suggestion` is **styling**, not different text:
  `SEV[sev].label` is `"Critical"`/`"Warning"`/`"Suggestion"`
  (`client/src/vendor/ui/primitives/tokens.ts:10-13`). **Chosen: reuse `SEV[sev].label` verbatim
  and apply `textTransform: "lowercase"` in the badge style.** Zero new i18n strings, one source of
  truth for severity vocabulary, consistent with the rest of the app.
- `✦` is `Icon.Sparkles` (present in the registry, `client/src/vendor/ui/icons.tsx`).

## Gaps (the binding spec)

| # | Gap | Where it is wrong today | Resolution |
|---|---|---|---|
| 1 | Empty group must render nothing | `SmartDiffViewer.tsx:169-171` renders the heading + `<div style={s.groupEmpty}>—</div>` | Render-time `return null` for the whole section. Server contract and builder unchanged. |
| 2 | Group header = one row: dot · bold label · muted blurb · right-aligned file count | `SmartDiffViewer.tsx:165-168` stacks label over blurb (`styles.ts:48-60`), no dot, no count | Flex row; `dotColor` per role in `constants.ts`; new `groups.fileCount` ICU plural. |
| 3 | Per-line badge = icon + text, not a bare dot | `CodeLine.tsx:74` renders `<span aria-hidden style={lineMarker(severity)} />` (`diff-viewer/styles.ts:110-121`) | `lineMarker` → `lineBadge`; render `Icon[SEV[sev].icon]` + `SEV[sev].label`, lowercased by CSS, tinted `SEV[sev].c` on `SEV[sev].bg`. |
| 4 | "Warning and suggestion badges are missing" | **Not a bug** — see the diagnosis above | No code change. Closed by gap 3's text labels. |
| 6 | Summary belongs *inside* the diff panel, with an icon | `SmartDiffViewer.tsx:82` renders it as detached italic text **above** the card | Two optional slots on `FileCard`: `headerExtras` (chip after `+N −M`) and `bodyLead` (first row of the body). |
| 7 | Only `core` shows a summary | `SmartDiffViewer.tsx:82` renders it for every role | `showSummary` flag on `GROUP_META`. Render-time policy only — the server keeps computing summaries for all roles. |
| 8 | Stat line must be colourful | `styles.ts:24-27` — one muted colour for the whole string | `t.rich` with `<add>`/`<del>` tags → `var(--code-add-text)` / `var(--code-del-text)`, the exact tokens `PrDetailHeader.tsx:72-73` uses. |
| 9 | `REVIEWER-ORDERED DIFF` header row spacing/treatment | Already a single flex row with the toggle right-aligned (`styles.ts:4-16`) | **Verify-only.** Compare against the design in a browser after gap 8 lands; change spacing only if it actually differs. |

## Component map

| Module | Component | Status | Layer | Path | Gaps | Step |
|---|---|---|---|---|---|---|
| client | `smartDiff.json` | changed | i18n | `client/messages/en/smartDiff.json` | 2, 6, 8 | 1 |
| client | `GROUP_META` | changed | `_components` constants | `.../SmartDiffViewer/constants.ts` | 2, 7 | 2 |
| client | `SmartDiffViewer styles` | changed | `_components` styles | `.../SmartDiffViewer/styles.ts` | 1, 2, 6, 8 | 3 |
| client | `diff-viewer styles` | changed | shared component | `client/src/components/diff-viewer/styles.ts` | 3 | 4 |
| client | `CodeLine` | changed | shared component | `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | 3 | 4 |
| client | `FileCard` | changed | shared component | `client/src/components/diff-viewer/FileCard/FileCard.tsx` | 6 | 5 |
| client | `SmartDiffFileRow` | changed | `_components` | `.../SmartDiffViewer/SmartDiffViewer.tsx:25` | 6, 7 | 6 |
| client | `SmartDiffViewer` | changed | `_components` | `.../SmartDiffViewer/SmartDiffViewer.tsx:105` | 1, 2, 7, 8 | 6 |
| client | `smartDiff helpers` | **reused, unchanged** | `_components` | `.../SmartDiffViewer/helpers.ts` | 4 | — |
| client | `DiffViewer` | **reused, unchanged** | shared component | `client/src/components/diff-viewer/DiffViewer/` | — | 5 |
| client | `findings-preview` | **untouched** | shared component | `client/src/components/findings-preview/` | — | — |

## Steps

### 1. i18n strings (gaps 2, 6, 8)

`client/messages/en/smartDiff.json` — add/change, keeping the existing keys:

- change `stats` from `"{n} files +{a} −{d}"` to `"{n} files <add>+{a}</add> <del>−{d}</del>"`
  (keep the U+2212 `−`, matching `FileCard.tsx:101` and `PrDetailHeader.tsx:73`).
- add `groups.fileCount`: `"{count, plural, one {# file} other {# files}}"`.
- add `summaryChip`: `"summary"` and `summaryLabel`: `"What this does:"`.

No severity-label keys — gap 3 reuses `SEV[sev].label`. `client/src/i18n/request.ts` auto-loads
the file; nothing to register.

*Skills:* `frontend-ui-architecture` · *Verify:* `pnpm typecheck` in `client/`

### 2. `GROUP_META` gains dot colour and summary policy (gaps 2, 7; depends on 1)

In `SmartDiffViewer/constants.ts`, extend the `GROUP_META` record type with two fields rather than
adding a parallel `Record<SmartDiffRole, string>` — a second record would be a second place to keep
in sync, and `GROUP_META` already owns per-role render policy (`defaultOpen`). Say so in a comment.

- `dotColor`: `core` → `"var(--accent)"`, `wiring` → `"var(--warn)"`, `boilerplate` →
  `"var(--text-muted)"`.
- `showSummary`: `core` → `true`, `wiring` → `false`, `boilerplate` → `false`, with a comment that
  the server still computes `pseudocode_summary` for every role and this is render-time policy only.

`SmartDiffRole` stays `import type`; `GROUP_ORDER` stays a local literal.

*Skills:* `frontend-ui-architecture`, `typescript-expert` · *Verify:* `pnpm typecheck` in `client/`

### 3. `SmartDiffViewer/styles.ts` (gaps 1, 2, 6, 8; depends on 2)

- **Delete** `groupEmpty` (its only consumer disappears in step 6).
- `groupHeader` → `{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }`.
- add `groupDot(color: string): CSSProperties` → `{ width: 8, height: 8, borderRadius: 99,
  background: color, flexShrink: 0 }`.
- `groupBlurb` → drop `marginTop`; add `flex: 1, minWidth: 0, overflow: "hidden", textOverflow:
  "ellipsis", whiteSpace: "nowrap"` so it sits beside the label and the count keeps its right edge.
- add `groupCount` → `{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }`.
- add `statsAdd` → `{ color: "var(--code-add-text)" }` and `statsDel` →
  `{ color: "var(--code-del-text)" }`.
- `summaryChip` → restyle for the card **header**: `{ display: "inline-flex", alignItems: "center",
  gap: 4, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }`. Drop `fontStyle: "italic"`,
  `maxWidth` and the ellipsis rules — the full text now lives in the body row.
- add `summaryRow` → `{ display: "flex", alignItems: "center", gap: 6, padding: "2px 14px 8px",
  fontSize: 12, lineHeight: "18px", color: "var(--text-muted)" }` and `summaryIcon` →
  `{ color: "var(--accent)", flexShrink: 0 }`.

*Skills:* `frontend-ui-architecture` · *Verify:* `pnpm typecheck` in `client/`

### 4. Per-line severity badge (gap 3 → closes gap 4)

**`client/src/components/diff-viewer/styles.ts`:** replace `lineMarker(sev)` (lines 109-121) with
`lineBadge(sev): CSSProperties`. Keep the existing `severityColor(sev)`/`SEV` indirection (the
"reuse `SEV`, no private colour map" fix from 0004 — do not regress it) and add a background read
from `SEV[sev]?.bg`:

`{ display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "center", flexShrink: 0,
marginLeft: 8, marginRight: 4, padding: "0 6px", borderRadius: 4, fontSize: 10.5, fontWeight: 600,
lineHeight: "16px", letterSpacing: "0.02em", textTransform: "lowercase", whiteSpace: "nowrap",
color: severityColor(sev) ?? "var(--text-muted)", background: SEV[sev]?.bg ?? "var(--bg-hover)" }`

`severityBorderFor` is unchanged. Grep first: `lineMarker` has exactly one consumer,
`CodeLine.tsx:9,74`.

**`client/src/components/diff-viewer/CodeLine/CodeLine.tsx`:** import `Icon, SEV` from
`@devdigest/ui` (barrel only) alongside the existing `import type { Severity } from
"@devdigest/shared"`; do **not** import `@devdigest/ui`'s own `Severity` (duplicate identifier).
Replace line 74 with a badge that renders the icon and the label:

- resolve `const meta = SEV[severity]` and `const SevIcon = Icon[meta?.icon ?? "Info"]`;
- render `<span style={lineBadge(severity)}><SevIcon size={11} />{meta?.label}</span>` after the
  `s.lineText` span, inside the same `lineRowFor` row;
- **remove `aria-hidden="true"`** — the badge now carries visible text, which is its accessible
  name. Add a one-line comment saying the old dot was aria-hidden because it was decorative and
  this one is not.

With `severity` undefined the row stays byte-identical, so the plain `DiffViewer` path is unaffected.

*Skills:* `frontend-ui-architecture`, `react-best-practices` · *Verify:* `pnpm typecheck && pnpm test`

### 5. `FileCard` summary slots (gap 6)

`client/src/components/diff-viewer/FileCard/FileCard.tsx` gains exactly two new **optional** props,
same discipline as plan 0004's six:

- `headerExtras?: React.ReactNode` — rendered in the header row immediately **after** the
  `fileStat` span (`FileCard.tsx:99-102`) and before the comment count. Note in the prop docblock
  that the header `<div>` carries the open/close `onClick`, so anything placed here must be
  non-interactive text.
- `bodyLead?: React.ReactNode` — rendered as the **first child** of `<div style={s.fileBody}>`
  (`FileCard.tsx:113`), above both the `noDiff` branch and the line list, so a patch-less file
  still shows it.

Both are `ReactNode` slots rather than a typed `summary: string` prop on purpose: the copy
("summary", "What this does:") belongs to the `smartDiff` i18n namespace, and `diff-viewer` is a
cross-route shared component that must not own a feature's strings. Put that reason in a comment.
With both omitted the render is byte-identical.

Do **not** touch `client/src/components/diff-viewer/index.ts`: the barrel keeps exporting exactly
`DiffViewer`, `FileCard`, `DiffCommentApi` (0004 correctness fix).

*Skills:* `frontend-ui-architecture`, `react-best-practices` · *Verify:* `pnpm typecheck && pnpm test`

### 6. `SmartDiffViewer` composition (gaps 1, 2, 6, 7, 8; depends on 1-5)

- **Gap 8** (`:136`): `t.rich("stats", { n, a, d, add: (c) => <span style={s.statsAdd}>{c}</span>,
  del: (c) => <span style={s.statsDel}>{c}</span> })`. Precedent for `t.rich` with tag callbacks:
  `CreateSkillFromConventionsModal.tsx:90-99` + `messages/en/conventions.json:52`.
- **Gap 1** (`:169-171`): replace the `groupEmpty` branch with an early
  `if (!group || group.files.length === 0) return null;` inside the `GROUP_ORDER.map` callback,
  **before** the header is built, with a comment: the server deliberately always emits all three
  groups so the payload shape is stable (plan 0004, chosen option — do not "fix" it server-side);
  hiding an empty one is a render decision.
- **Gap 2** (`:165-168`): one `s.groupHeader` row containing
  `<span aria-hidden="true" style={s.groupDot(meta.dotColor)} />`,
  `<span style={s.groupLabel}>{t(meta.labelKey)}</span>`,
  `<span style={s.groupBlurb}>{t(meta.blurbKey)}</span>`,
  `<span style={s.groupCount}>{t("groups.fileCount", { count: group.files.length })}</span>`.
  The dot is decorative (the label carries the meaning) → `aria-hidden`.
- **Gaps 6 + 7** — in `SmartDiffFileRow` (`:25-96`): add a `showSummary: boolean` prop, passed from
  the group loop as `meta.showSummary`. Compute
  `const summary = showSummary ? file.pseudocode_summary : null;`. Then:
  - **remove** the summary `<span>` from `s.fileHeaderExtras` (`:82`); that row keeps the red dot
    and the findings button only, and its `&&` guard at `:70` narrows to `flaggedLines.length > 0`;
  - pass to `FileCard`:
    `headerExtras={summary ? <span style={s.summaryChip}><Icon.Sparkles size={11} style={s.summaryIcon} />{t("summaryChip")}</span> : undefined}`
    and
    `bodyLead={summary ? <div style={s.summaryRow}><Icon.Sparkles size={12} style={s.summaryIcon} />{t("summaryLabel")} {summary}</div> : undefined}`.
  - `Icon` comes from the `@devdigest/ui` barrel.

**Do not change** `helpers.ts`, the `severityByLine`/`markers` wiring (`:51`, `:90`), the
`countFindingsByFile` badge count (`:76-79`), or the `usePrReviews`/`usePrSmartDiff` calls. The two
`useMemo`s at `:111-113` stay; add no state — everything new is derived at render.

*Skills:* `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` · *Verify:*
`pnpm typecheck && pnpm test` in `client/`

### 7. Browser check, gap 4 confirmation, gap 9 comparison (depends on 6)

No file change. The dev servers are **already running** on :3000 (web) and :3001 (API), started by
another session — **do not kill, restart or `docker` anything** beyond a read-only `psql`.

If a JS-executing browser tool is available, load PR #4 and PR #1 and check the items in
*Verification*. If not, say so under *Not verified* and hand the visual check to the user — **do
not** substitute a `curl` of the page HTML: next-intl serialises the entire `smartDiff` namespace
into the flight payload, so grepping for `"Core logic"` or `"critical"` is a guaranteed false
positive. The only honest curl-level check is that the page returns 200 and the compiled `page.js`
chunk contains the new symbol names.

**Gap 9:** with gap 8 in place, compare the `REVIEWER-ORDERED DIFF` row against the design. It is
*already* a single flex row (`styles.ts:4-16`) with the heading + stats left and the toggle right,
uppercased via `textTransform`. Change spacing (`gap`, `marginBottom`) **only** if the browser
comparison shows a real difference. Report what differed, or that nothing did.

**Gap 4:** confirm on PR #4 `server/src/app.ts` that lines 110/111/112 now read `⚠ warning` in
amber while 91-109 read `⊙ critical` in red, and record that no `suggestion` badge appears because
the latest-per-agent review carries none. Do **not** "fix" worst-severity-wins or latest-per-agent.

*Verify:* the browser observations, plus `git status --short` showing no file outside the seven in
the *Component map*, and no stray `pnpm-workspace.yaml`.

## Skills for implementer

| Step | Skill | Rule from the skill that governs this step |
|---|---|---|
| 1, 3, 5, 6 | `frontend-ui-architecture` | *Step 0 — the project's conventions win*: copy the sibling `_components/<Name>/` shape already in place. *Dependencies point one way*: `src/components/diff-viewer` is shared and must not import a feature or own a feature's i18n copy — hence the `ReactNode` slots in step 5. *Promote on the second consumer*: the badge stays inline in `CodeLine`, no new folder. |
| 2, 4, 5, 6 | `react-best-practices` | *Derive, don't store*: `summary`, `markers`, `totals` and the group sections are computed during render from the two query payloads — add no new `useState`, no new `useEffect`. Optional props keep every existing call site byte-identical. |
| 6 | `next-best-practices` | `"use client"` stays at the top of every interactive component under `app/**`. |
| 2 | `typescript-expert` | `GROUP_META: Record<SmartDiffRole, {…}>` must stay exhaustive under `tsc` with `SmartDiffRole` imported as a **type only**; adding `dotColor`/`showSummary` to the record's inline type makes a missing role a compile error. |

## Architecture constraints

- **Client-only.** `server/**` is not opened. The server keeps emitting all three groups (including
  empty ones) and keeps computing `pseudocode_summary` for every role; gaps 1 and 7 are render-time
  policy.
- **No contract edit.** `@devdigest/shared` imports stay `import type` **only**.
- **`@devdigest/ui` from the barrel only** (`import { Icon, SEV } from "@devdigest/ui"`).
- Never import `@devdigest/ui`'s `Severity` beside the contract's — duplicate identifier.
- **`React.useEffectEvent` is banned.** Nothing in this plan needs it.
- **Five correctness fixes from 0004 that must not regress** (check each in the final `git diff`):
  1. the findings badge counts **findings** via `countFindingsByFile`, not flagged lines, with ICU
     plurals;
  2. `severityForFlaggedLines()` still intersects the client severity map with the server's
     authoritative `finding_lines` — a marker must never render from the raw client map;
  3. `["pr-smart-diff", prId]` is still invalidated alongside `["reviews", prId]` in all four
     mutations in `client/src/lib/hooks/reviews.ts` (file not touched by this plan);
  4. `diff-viewer/styles.ts` still reads colours from `SEV`, never a private map — `lineBadge`
     extends that, it does not replace it;
  5. the `diff-viewer` barrel still exports exactly `DiffViewer`, `FileCard`, `DiffCommentApi`.
- New i18n strings go in the existing `client/messages/en/smartDiff.json` namespace.
- Every new `FileCard`/`CodeLine` prop is optional, so the plain `DiffViewer` path renders
  identically.

## Do-not-touch that this task hits

- `server/**` — **not touched at all.** Every gap is closed client-side.
- `server/src/vendor/shared/**` and `client/src/vendor/shared/**` — zero contract change.
- `client/src/vendor/ui/**` — `SEV`'s `"Critical"` label and the `Severity` enum stay as they are
  (the badge lowercases with CSS).
- `client/src/components/findings-preview/**` — not touched (gap 5 dropped).
- `client/src/app/.../SmartDiffViewer/helpers.ts` — not touched.
- `server/src/db/migrations/**`, `server/src/db/seed.ts`, `e2e/specs/*.flow.json`, all four lock
  files, the `devdigest_pgdata` volume. `client/` is **pnpm**; never run `npm install` here.
- The running dev servers on :3000/:3001 and the `devdigest-postgres` container — read-only use
  only; do not restart or stop them.

## Verification (whole task)

- `client/`: `pnpm typecheck` — 0 errors. (If `ERR_PNPM_IGNORED_BUILDS`, run
  `./node_modules/.bin/tsc --noEmit`.)
- `client/`: `pnpm test` — all green. Run the touched suites first, then the full module suite as
  the regression check. Attribute every failure.
- `git status --short` — only the seven files from the *Component map*, no stray
  `pnpm-workspace.yaml`.
- **Browser (PR #4**, `http://localhost:3000/repos/50544f37-5b3d-40e7-b323-b3292b6333c9/pulls/4?tab=diff`**):**
  1. gap 1 — **no** `Boilerplate` heading, blurb or `—` anywhere;
  2. gap 2 — each header is one row: coloured dot, bold label, muted blurb, right-aligned count;
  3. gap 3 + 4 — `server/src/app.ts` lines 91-109 end in a red `⊙ critical` badge and 110-112 in an
     amber `⚠ warning` badge; `server/test/rate-limit.test.ts` 44-46 red. No `suggestion` badge
     (expected — the latest-per-agent review has none);
  4. gap 6 — `server/src/platform/rate-limit-metrics.ts`'s card header shows `✦ summary` next to
     `+N −M`, and the first row of its open body is `✦ What this does: exports …`. Nothing renders
     above the card except the red dot + findings badge;
  5. gap 8 — the stat line reads `6 files +N −M` with `+N` green and `−M` red;
  6. regression — clicking the findings badge still opens the card and scrolls to the flagged line,
     advancing on a second click; the Smart/Original toggle still swaps to the flat `DiffViewer`,
     which shows **no** severity badges and **no** summary rows.
- **Browser (PR #1**, 57 files: core 11 / wiring 40 / boilerplate 6**):** all three groups render
  with correct counts; `Boilerplate` cards still collapsed on first paint; gap 7 — no summary chip
  and no summary row on any `wiring` or `boilerplate` file, even where
  `GET /pulls/<id>/smart-diff | jq '.groups[] | select(.role!="core") | .files[] | select(.pseudocode_summary != null)'`
  shows the server returned one.
- If no browser tool is available, report all of the above under *Not verified*.

## Handed to test-writer

Skill: `react-testing-library`. Colocated `<Name>.test.tsx`, `fetch` mocked — no API needed.

- `.../SmartDiffViewer/SmartDiffViewer.test.tsx`
  - gap 1: a payload whose `boilerplate` group is `files: []` renders **no** `Boilerplate` text and
    no `—`;
  - gap 2: each visible group header shows its file count with the right ICU plural (`1 file` vs
    `5 files`) and the label and blurb are in the same row element;
  - gap 7: a `wiring` file with a non-null `pseudocode_summary` renders neither `summary` nor
    `What this does:`; the same summary on a `core` file renders both;
  - gap 8: the stat line renders `+135` and `−16` in separate elements;
  - regression: the findings badge still reports the **findings** count (`3 findings` over 22
    flagged lines), still opens the card and scrolls on click, advancing on a second click; assert
    with `getByRole("button", { name: /findings/ })`, **never** `queryByRole("link")`.
- `client/src/components/diff-viewer/CodeLine.test.tsx`
  - gap 3: `severity="CRITICAL"` renders visible text `critical` (case-insensitive — the
    lowercasing is CSS, the DOM text is `SEV.label` `"Critical"`) and the badge is **not**
    `aria-hidden`; `WARNING` → `warning`; `SUGGESTION` → `suggestion`;
  - no `severity` prop → no badge, no left border, row markup unchanged.
- `client/src/components/diff-viewer/FileCard.test.tsx`
  - gap 6: `headerExtras` renders inside the header row after the `+N −M` stat; `bodyLead` renders
    as the first child of the body, including when `patch` is null;
  - both omitted → identical render to today; uncontrolled `AUTO_EXPAND_MAX_LINES` and the
    controlled `open` override both still hold.
- **No test for gap 5** — the hover popover is out of scope.

## Risks

- **`--accent` and `--sugg` are the same blue** (`#3b82f6`), and the Wiring dot's `--warn` is the
  same amber as a `WARNING` badge. A reader may read a group dot as a severity. Mitigation: the
  group dot is 8 px and sits beside a text label, the severity badge carries text — but if the
  browser check shows they read as the same vocabulary, raise it rather than silently re-picking.
- **`t.rich` tag names must match the JSON exactly.** next-intl throws at render, not at `tsc`, on
  a missing `<add>`/`<del>` handler — and `pnpm test` only catches it if a test renders the header.
- **`groupBlurb` gaining `flex: 1` + ellipsis** can truncate the blurb on a narrow viewport before
  the count. Intentional, but confirm it is fully visible at the normal width.
- **The findings badge is now the only thing left above the card.** It may read as orphaned once
  the summary moves inside — that is the *Open question*, not a licence to redesign it mid-step.
- **Removing `aria-hidden` from the line marker** adds "critical"/"warning" to the accessible text
  of many rows. Correct (WCAG: never colour alone) but noisier for screen readers — note it, do not
  re-hide it.
- **Shared worktree.** Plan 0004's work is uncommitted and another session may be editing the same
  files; re-read each file immediately before editing. Never `git stash`.

## Open questions

None blocks a step.

- **Should the red dot + findings badge also move into the `FileCard` header row**, now that the
  summary has left that row? **Default: no** — leave `s.fileHeaderExtras` above the card. If the
  browser check shows it reading as orphaned, record a *Follow-up*, do not do it.
- **Exact gap-9 spacing.** No design asset was available to the planner. **Default: no structural
  change** beyond gap 8's colouring.
