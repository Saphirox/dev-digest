# 0007 — Finding deep link (`?tab=findings&finding=<id>`)

**Status:** ready (two non-blocking open questions, both with stated defaults)
**Citations valid as of:** `59eb758` (dirty tree — Smart Diff work uncommitted)
**Lands AFTER** [0006-checklist-gaps.md](0006-checklist-gaps.md).

## Goal

From an expanded file in **Files changed → Smart order**, clicking the inline severity badge on a
flagged line navigates to `?tab=findings&finding=<id>` and the Findings tab opens the owning run's
accordion and highlights exactly that finding's card.

**Acceptance:** on PR #4, clicking the WARNING badge on `server/src/app.ts` line 100/101/102 lands
on the Findings tab with finding `ec4699fb-234b-4dba-b089-31e715c67d58` highlighted (border +
boxShadow via `FindingCard`'s existing `focused`) and expanded; `pnpm typecheck` and `pnpm test`
pass in `client/` at or above the 41 files / 181 tests / 0 skipped baseline.

This is homework criterion 30 — **BONUS, does not affect pass/fail.**

## Out of scope

- Any server, contract, migration or `reviewer-core` change. No `SmartDiff`/`SmartDiffFile` edit in
  either vendored copy.
- No new visual language: no new highlight style, no new context, no transient DOM outline.
- No test authoring (a `test-writer` runs after) — see *Handed to test-writer*.
- No edits to `e2e/specs/*.flow.json`. No commit, push, PR or review. No restarting the dev servers.
- Scroll restoration / retry-until-data-loads for a cold load; per-severity dots (that is 0006).

## Chosen options (verbatim, binding — do not re-open)

**1 — badge click: callback prop** (NOT a render slot, NOT an `<a href>`). `CodeLine.tsx:77-85`
gains an optional `onSeverityClick?: () => void`. When set, the badge renders as
`<button type="button" style={lineBadgeButton(severity)}>`; when unset it stays a `<span>` exactly
as today, so the plain `DiffViewer` path is byte-identical. `FileCard.tsx:143-153` forwards an
optional `onLineSeverityClick?: (line: number) => void`. `SmartDiffViewer` resolves line → finding
id and calls a new `onOpenFinding(id)` prop, which `DiffTab` receives from `page.tsx`, implemented
with the EXISTING `setParam` helper (`page.tsx:63-69`) setting `tab=findings` and `finding=<id>` —
keep `router.replace`, matching the page's convention for `?tab`/`?trace`. Deliberately NOT `push`.

**2 — highlight: reuse `FindingCard.focused`, prop-drilled** (NOT a new context, NOT a transient DOM
outline). Thread `focusFindingId` from `page.tsx` → `FindingsTab` → `ReviewRunAccordion` →
`FindingsPanel` → `FindingCard`'s existing `focused` prop (`FindingCard.tsx:33`, styled at
`FindingCard/styles.ts:5-18`). No new visual code. Seed `useFindingKeyboardNav`
(`useFindingKeyboardNav.ts:15-25`) from that id so j/k continues from the deep-linked card and there
is exactly ONE notion of focus; use its existing re-anchor-during-render block, **not** an effect,
and **never** `React.useEffectEvent`. A finding in a collapsed accordion has NO DOM node — use
`ReviewRunAccordion`'s existing `targetRunId`/`targetNonce` mechanism (`:32-53`) to open and scroll
the right run, resolving the finding's `run_id` from the reviews payload in `page.tsx`.

**3 — overlapping findings: worst severity wins, ONE badge per line.** Link the badge to the finding
whose severity it already shows, using the same `worseOf` tie-break `buildSeverityByFile`
(`SmartDiffViewer/helpers.ts:43-55`) applies to the colour, so badge and link never disagree. Add
`buildFindingIdByLine(reviews): Map<string, Map<number, string>>` to `SmartDiffViewer/helpers.ts`,
fed by the SAME `latestFindingsPerAgent()` funnel (`helpers.ts:25-35`), so the id set can never
diverge from the severity set.

## Effort estimate

| Steps | Work | Estimate |
|---|---|---|
| 1–3 | `diff-viewer` button variant + prop threading (`styles.ts`, `CodeLine`, `FileCard`) | 40–55 min |
| 4–6 | `buildFindingIdByLine`, `SmartDiffViewer` wiring, `DiffTab` pass-through | 45–60 min |
| 7 | `page.tsx`: `setParams`, `finding` param, finding → run resolution | 30–40 min |
| 8–10 | `FindingsTab` target seeding, `ReviewRunAccordion`, `FindingsPanel` + keyboard-nav anchor | 60–80 min |
| 11 | Verification incl. the browser pass on PR #4 | 25–35 min |
| **Total (implementer)** | client-only, 10 files, no server/contract change | **3.5–4.5 h** |
| Follow-on `test-writer` | 5 suites (4 existing, 1 new) | 1–1.5 h (not in the total) |

## Context

**INSIGHTS applied** (`client/INSIGHTS.md`): `React.useEffectEvent` is banned (ref +
adjust-state-during-render instead — governs steps 8 and 10); the findings dot is aria-label-only so
assert `toHaveAccessibleName` — the new badge is the opposite, visible text IS the name (step 2);
curl'ing SSR HTML cannot verify client-fetched UI (next-intl serialises whole namespaces into the
flight payload), which is why *Verification* demands a real browser.

**History:** `git log --all -S'onSeverityClick'` → nothing, no prior attempt.

**Assumptions:** (a) `focusFindingId` derives from `useSearchParams().get("finding")` in `page.tsx` —
the URL is the single source of truth, matching `?tab`/`?trace`; (b) the deep-linked card arrives
**expanded**; (c) a user-set severity pill that would hide the target is left alone (step 10).

## Modules & files — client only

| File | Change |
|---|---|
| `src/components/diff-viewer/styles.ts:122-142` | add `lineBadgeButton(sev)` = `lineBadge(sev)` + button reset. Still `SEV`-sourced; `lineBadge` untouched |
| `src/components/diff-viewer/CodeLine/CodeLine.tsx:77-85` | optional `onSeverityClick`; `<button>` when set, `<span>` otherwise |
| `src/components/diff-viewer/FileCard/FileCard.tsx:44-55,143-153` | optional `onLineSeverityClick?: (line: number) => void`, forwarded per line only when `ln.newNo != null` |
| `.../SmartDiffViewer/helpers.ts` | new exported `buildFindingIdByLine` |
| `.../SmartDiffViewer/SmartDiffViewer.tsx` | `onOpenFinding?: (id: string) => void`; build the map; row passes `onLineSeverityClick` |
| `.../DiffTab/DiffTab.tsx` | `onOpenFinding` pass-through |
| `.../pulls/[number]/page.tsx` | generalise `setParam` → `setParams`; read `finding`; resolve id → `run_id`; pass `focusFindingId`/`onOpenFinding`; `setTab` clears `finding` |
| `.../FindingsTab/FindingsTab.tsx` | `focusFindingId` + `focusRunId` props; seed the existing `target` state during render |
| `.../ReviewRunAccordion/ReviewRunAccordion.tsx` | `focusFindingId` prop → `FindingsPanel` |
| `.../FindingsPanel/FindingsPanel.tsx` + `useFindingKeyboardNav.ts` | `focusFindingId`, `anchorIdx`, `defaultExpanded` rule, scroll the focused card |

**Unchanged on purpose:** `FindingCard.tsx` (step 10), the `diff-viewer` barrel,
`lib/hooks/reviews.ts`, both `vendor/shared` copies.

## Steps

### 1. Button variant of the line badge
Add `lineBadgeButton(sev: Severity): CSSProperties` spreading `lineBadge(sev)` plus the button reset
(`border: "none"`, `cursor: "pointer"`, `fontFamily: "inherit"`) so the button is pixel-identical to
today's span. Do not fork the `SEV` lookup; do not modify `lineBadge`.
*Verify:* `pnpm typecheck` in `client/`

### 2. `CodeLine.onSeverityClick` (depends on 1)
Add `onSeverityClick?: () => void`. In the `{severity && …}` block: when set render
`<button type="button" style={lineBadgeButton(severity)} onClick={onSeverityClick}>` with the **same
children** (`<SevIcon size={11} />` + `sevMeta?.label`); otherwise keep today's exact `<span>`.
**No `aria-label`, no `title`, no `useTranslations`** — the accessible name stays the visible label
("Critical"/"Warning"/"Suggestion"); adding i18n here would break `CodeLine.test.tsx`, which renders
without a `NextIntlClientProvider`. Keep the existing "never `aria-hidden`" comment.
*Verify:* `pnpm test src/components/diff-viewer` in `client/`

### 3. `FileCard.onLineSeverityClick` (depends on 2)
Add the optional prop beside `severityByLine`. In the line map pass
`onSeverityClick={onLineSeverityClick && ln.newNo != null ? () => onLineSeverityClick(ln.newNo!) : undefined}`.
Omitted prop ⇒ byte-identical render.
*Verify:* `pnpm test src/components/diff-viewer` in `client/`

### 4. `buildFindingIdByLine`
Export `buildFindingIdByLine(reviews: ReviewRecord[]): Map<string, Map<number, string>>` next to
`buildSeverityByFile`, iterating the SAME `latestFindingsPerAgent(reviews)` funnel and applying the
SAME `worseOf` tie-break: keep a per-line `{ severity, id }` and overwrite only when the new finding
is strictly worse, so an equal-severity tie keeps the first exactly as the colour map does. Return
only the ids. Document the invariant: every line that gets a marker has an id here.

**0006 sharing rule (binding):** if 0006 has already exported a per-file finding list derived from
`latestFindingsPerAgent`, build this map **from that structure**; never add a second funnel and never
re-derive from raw `reviews`. If `latestFindingsPerAgent` is still private, export it rather than
duplicating it.
*Verify:* `pnpm typecheck` in `client/`

### 5. Wire the map through `SmartDiffViewer` (depends on 3, 4) — **conflict-prone with 0006**
Add `onOpenFinding?: (id: string) => void`;
`const findingIdByFile = React.useMemo(() => buildFindingIdByLine(reviews ?? []), [reviews])`; pass
`findingIdByLine={findingIdByFile.get(file.path)}` and `onOpenFinding` into `SmartDiffFileRow`; in
the row pass `onLineSeverityClick` to `FileCard`.

Do **not** touch `handleBadgeClick`, `nextFindingIndex`, `pathAdornment`, `headerExtras` or
`bodyLead` — that block is 0006's. Keep the edit confined to the props list and the new
`onLineSeverityClick` line so the two diffs don't collide.
*Verify:* `pnpm test src/app/repos` in `client/`

### 6. `DiffTab` pass-through (depends on 5)
Add `onOpenFinding?: (id: string) => void` and forward to `<SmartDiffViewer>`. Nothing else.

### 7. Page owns the URL state (depends on 6)
(a) Generalise `setParam` into `setParams(patch: Record<string, string | null>)` building ONE
`URLSearchParams` and ONE `router.replace`, then keep `setParam = (k, v) => setParams({ [k]: v })` so
every existing call site is untouched — **two sequential `setParam` calls would both read the same
stale `search` and drop one key**, which is why this generalisation is required.
(b) `setTab` becomes `setParams({ tab: t, finding: null })` so switching tabs clears a stale highlight.
(c) `const focusFindingId = search.get("finding")`.
(d) Derive, don't store:
`const focusRunId = React.useMemo(() => runs.find(r => r.findings.some(f => f.id === focusFindingId))?.run_id ?? null, [runs, focusFindingId])`.
(e) Pass `focusFindingId`/`focusRunId` to `FindingsTab` and
`onOpenFinding={(id) => setParams({ tab: "findings", finding: id })}` to `DiffTab`.

### 8. `FindingsTab` opens the owning run (depends on 7)
Add `focusFindingId?: string | null` and `focusRunId?: string | null`. Reuse the existing `target`
state (`:70-74`), adjusted during render and keyed on the **resolved run id** so it fires both on
mount and when `runs` arrive later:
`const [prevFocusRunId, setPrevFocusRunId] = React.useState<string | null>(null); if (focusRunId !== prevFocusRunId) { setPrevFocusRunId(focusRunId ?? null); if (focusRunId) setTarget(p => ({ runId: focusRunId, n: (p?.n ?? 0) + 1 })); }`
**No effect, no `useEffectEvent`.** Forward `focusFindingId` to every `<ReviewRunAccordion>`; leave
`defaultOpen={i === 0}` and the timeline's `handleGoToReview` exactly as they are.

### 9. `ReviewRunAccordion` forwards the focus id (depends on 8)
Add `focusFindingId?: string | null` and pass to `<FindingsPanel>`. Do not touch the
`targetRunId`/`targetNonce` effect or its eslint-disable.

### 10. `FindingsPanel` — one notion of focus (depends on 9)
Add `focusFindingId?: string | null`. Derive
`anchorIdx` = index of the focused finding in `shown` (or 0), and `hasFocus`. Pass `anchorIdx` to
`useFindingKeyboardNav(shown, onAction, anchorIdx)`; keep `focused={i === focusIdx}` unchanged — the
highlight comes from the seeded index, so there is exactly one notion of focus.
`defaultExpanded={hasFocus ? f.id === focusFindingId : i === 0}` (only in the panel containing the
target). Add one effect keyed on `focusFindingId` + `hasFocus` that does
`document.querySelector('[data-finding-id="…"]')?.scrollIntoView({ block: "center" })` — the
attribute already exists at `FindingCard.tsx:54`; it runs after the accordion's scroll, so the card
wins.

In `useFindingKeyboardNav.ts`: add a third parameter `anchorIdx = 0`, initialise `focusIdx` with it,
and extend the existing render-time re-anchor to also fire when `anchorIdx` changes. Keep the
`latest` ref and the comment explaining why this is not `useEffectEvent`. The default preserves
today's behaviour for every other caller.

**`FindingCard` is NOT modified.** Its `expanded` is initialised once from `defaultExpanded`
(`:44`), which is enough: reaching the findings tab from the diff tab unmounts `DiffTab` and mounts
`FindingsPanel` → `FindingCard` fresh, and a collapsed accordion mounts its panel only when it
opens. A render-time re-sync would let a filter-driven reorder collapse a card the user expanded — a
regression for a case this flow cannot reach.

**Severity filter:** leave it alone. If a pill hides the target, `anchorIdx` falls back to 0 and the
deep link is a visible no-op. The defaults are non-hiding (`useFindingsFilter.ts:11-12`) and a tab
switch remounts the panel, so the only way to hit this is to set a pill *after* arriving — where
silently clearing the user's filter would be more surprising than no highlight.

### 11. Whole-task verification (depends on 10)
Run the *Verification* block. Do not write tests.

## Architecture constraints

- Client `@devdigest/shared` imports are **`import type` only**.
- UI primitives only through the `@devdigest/ui` barrel. Do **not** use `MonoLink` for the badge (it
  renders a `<button>` when `href` is unset) and do not use `Badge` (it silently drops `aria-label`).
- `diff-viewer` is cross-route shared and must not own feature strings — hence no i18n in the badge;
  **no new i18n key is needed**. If a richer name is ever wanted, `messages/en/shell.json`
  (`diffViewer.*`) owns it, not `smartDiff.json`, and it must START with the visible severity label
  (WCAG 2.5.3).
- Accessible name of the badge button: **the visible severity label** (`SEV[sev].label`; the
  lowercase look is `textTransform`). No `aria-label` override.
- Non-regression invariants: the flagged-line SET still comes from the server's `finding_lines` via
  `severityForFlaggedLines`; counts count findings not lines; the four `["pr-smart-diff", prId]`
  invalidations stay; `SEV` stays the single palette source; the `diff-viewer` barrel keeps exporting
  exactly `DiffViewer`/`FileCard`/`DiffCommentApi` (do **not** export the new style helper).
- Prop drilling `focusFindingId` through four levels is the chosen design; it pushes `FindingsTab`
  past the skill's 5–7 prop guideline — accepted deliberately (option 2 rules out a context).
- **Sequencing with 0006:** lands after it. Shared derivation mandatory (step 4). **Step 5 is the
  only conflict-prone step** — 0006 rewrites `pathAdornment`/`handleBadgeClick` in the same
  component. Re-read the file immediately before editing.

## Do-not-touch that this task hits

- `client/src/vendor/shared/**` / `server/src/vendor/shared/**` — no contract change; `finding_lines`
  stays a flat `number[]` and the id comes from the cached `/pulls/:id/reviews` payload.
- `e2e/specs/04-pr-findings.flow.json` — **read, not edited.** Its only URL assertions are
  `wait --url /pulls/482` and `wait --url tab=findings`, both reached by clicking "Agent runs" (i.e.
  `setTab`), which in step 7 sets `tab=findings` and *clears* `finding` — so no `&finding=` can
  appear on that path, and a substring URL wait would match anyway. **Adding the param cannot break
  this flow.**
- `devdigest_pgdata`, lock files, merged migrations — untouched. DB access is read-only `psql`.

## Verification (whole task)

- `client`: `pnpm typecheck` — no new errors.
- `client`: `pnpm test` — at or above **41 files / 181 tests / 0 skipped**. The implementer writes no
  tests, so the count should be unchanged; a *drop* means a regression.
- `server`: nothing to run — no server file is touched.
- **Browser, PR #4** at `http://localhost:3000/repos/50544f37-5b3d-40e7-b323-b3292b6333c9/pulls/4?tab=diff`
  (servers already running — never restart; a `curl` of the HTML proves nothing):
  1. **Happy path.** In Smart order expand `server/src/app.ts`; its flagged lines are exactly
     **100, 101, 102**, each showing a WARNING badge. Click one → URL becomes
     `…?tab=findings&finding=ec4699fb-234b-4dba-b089-31e715c67d58`, the Findings tab is active, and
     that card is bordered/box-shadowed and expanded. Same for `client/src/lib/api.ts` 37–39,
     `server/test/rate-limit.test.ts` 42–43, `server/src/modules/settings/routes.ts:72` (CRITICAL).
  2. **Keyboard continuity.** With the card highlighted, press `k` — focus moves to the card *above*,
     not to the top of the list (proves the nav was seeded, not merely painted).
  3. **Collapsed accordion.** PR #4's newest review is accordion index 0 and open by default, so the
     badge route cannot reach a closed accordion on today's data. Exercise it directly: load
     `…/pulls/4?tab=findings&finding=<an id from the OLDER review d3c16c2e>`. The second accordion
     must open, scroll into view, and highlight + expand that card.
  4. **Overlapping line.** Not reproducible on current data (see *Could not establish*). Rely on the
     helper unit tests in *Handed to test-writer*.
  5. **No regression on the plain viewer.** Toggle to Original order: badges render as before (spans,
     no pointer cursor, no navigation on click).
  6. **Stale param.** After a deep link, click Overview: the URL must lose `finding=`.

## Handed to test-writer

- `CodeLine.test.tsx` (extend): unset `onSeverityClick` → still a non-button with visible severity
  text, not `aria-hidden`; set → `getByRole("button", { name: /warning/i })`, `type="button"`, click
  calls the callback once. Renders without a `NextIntlClientProvider` — keep it that way.
- `FileCard.test.tsx` (extend): omitted → no buttons in the line list; provided → clicking a badge
  calls it with that line's `newNo`; never called for a line with no `newNo`.
- `SmartDiffViewer/helpers.test.ts` (extend): `buildFindingIdByLine` — worst severity wins regardless
  of input order; equal-severity overlap deterministic (first wins, matching `buildSeverityByFile`);
  only `kind === "review"` + latest-per-agent rows contribute; **the key set matches
  `buildSeverityByFile`'s per file/line exactly** (the "cannot diverge" property).
- `SmartDiffViewer.test.tsx` (extend): clicking a line badge calls `onOpenFinding` with the id of the
  finding whose severity the badge shows.
- `FindingsPanel.test.tsx` (**likely invalidated** by `anchorIdx` seeding): `focusFindingId` matching
  a shown finding → that card is focused and expanded, and `k` moves from it, not from index 0;
  hidden by a severity pill → falls back to index 0, no crash; absent → today's behaviour unchanged.
  Keep the existing "a/d act on the focused finding, starting at the top" test green.
- `FindingsTab.test.tsx` (new): a `focusRunId` pointing at a non-first run sets
  `targetRunId`/`targetNonce` on the right accordion without disturbing the timeline's
  `onGoToReview`; a `focusRunId` arriving late still fires exactly once.

## Risks

- **Step 5 merge conflict with 0006** — both edit `SmartDiffFileRow`'s props / `FileCard` call. Land
  after 0006, re-read immediately before editing, keep the edit minimal.
- **Two `scrollIntoView` calls** (accordion `smooth/start`, then card `center`) could visibly fight.
  Child effects commit before the parent's, so the card scroll lands last; if it looks janky, drop
  the card scroll rather than adding timers.
- **`setParam` → `setParams` refactor** touches every `?tab`/`?trace` call site. Keep `setParam` as a
  wrapper and re-check the trace drawer in the browser.
- **Prop drilling depth (4 levels)** lengthens `FindingsTab`/`FindingsPanel` prop lists — accepted.
- **`defaultExpanded` semantics** shift only inside the panel owning the target; verify other
  accordions still auto-expand their first card.

## Open questions

- **Cold-load deep-linking.** Out of scope, but making the URL the single source of truth makes a
  cold load work for free and is the only way to exercise the collapsed-accordion path on today's
  data. *Default:* implement the URL read as specified, add no extra work (no scroll restoration, no
  retries), note in the report that cold load happens to work.
- **Accessible name.** Chosen: the visible label alone, so several badges share a name. A richer name
  needs a `shell.json` key and a provider in `CodeLine.test.tsx`. *Default:* ship the visible label.

## Could not establish

- **The overlap originally described does not exist in current data.** PR #4 has two reviews, both
  from the same `agent_id`, so latest-per-agent keeps only the newest (`516df46f`), whose four
  findings do not overlap and do not flag line 105. Note the dev DB is shared and mutated: an earlier
  review (`5b183d0b`) DID contain overlapping ranges and was replaced at 21:13 by another session.
  The design is unchanged — the tie-break is still required for correctness — but the "click line
  105, land on the CRITICAL" browser check is not reproducible on today's rows.
- **The collapsed-accordion case is unreachable from the badge on PR #4** (single agent → newest
  review is accordion index 0). Reachable with ≥2 agents; exercised here via a direct URL.
- Whether 0006 will export a per-file finding list — step 4 states the rule for both outcomes.
