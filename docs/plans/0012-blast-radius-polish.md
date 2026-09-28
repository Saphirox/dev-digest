# 0012 — Blast Radius polish: endpoint-chip paging + Intent restyle

**Status:** ready
**Citations valid as of:** `e08a6db` (dirty tree — the uncommitted Blast Radius work from plan 0011)

## Goal
A. Stop a `SymbolRow` with many affected endpoints from rendering all of its endpoint chips in one long block. Show the first 10 chips, and add a button that reveals 10 more on each click. When everything is shown, the button reads "Show less" and goes back to 10. This is client-side only.
B. Restyle `IntentCard` and its `RiskAreas`/`RiskRow` children to match `BlastRadiusCard`, using `docs/images/blast-radius/06-intent-style-reference.png` as the target. Only styling changes. Content and behaviour stay the same.

**Done when:**
- A symbol with 23 endpoints shows 10, then 20, then 23 chips, then back to 10 after "Show less".
- A symbol with 10 or fewer endpoints shows no button.
- The Intent card's "INTENT" label is inside its bordered `Card`, grey, with the Re-derive action on the right. The two Overview cards line up at the top.
- `pnpm test` and `pnpm typecheck` pass in `client/`.

## Out of scope
- Any server, contract (`vendor/shared`), route, hook or mcp change. `endpoints_affected` is already sent in full.
- Paging cron chips (see the decision in Step 2).
- Changing Intent's content, order, data flow or re-derive behaviour, or the empty-state CTA.
- `globals.css` and the `.overview-grid` layout.
- Reviewing, committing, pushing, or running `/pr-self-review`.

## Context
- **INSIGHTS that apply** (`client/INSIGHTS.md`):
  - 2026-09-27, line 48: an ICU plural message needs its call site to pass `{ count }`. The new `showMoreEndpoints` key must be called with `{ count: n }`.
  - 2026-09-27, line 32: label inside or outside the `Card` must be checked against the screenshot. In `06`, the card border wraps "INTENT", as it does for Blast Radius (`BlastRadiusCard.tsx:73`).
  - 2026-09-20, line 45: the old orange INTENT label came from an earlier reference. Reference `06` and your request replace it.
  - 2026-09-27, line 52: stale `.next` cache. It only affects `globals.css`, which this plan does not touch, since all styles here are inline `styles.ts`. If a page looks stale during a manual check, `rm -rf .next` before restarting.
  - 2026-09-20, line 44: `Badge` drops `aria-label`. Not relevant, because no new labelled Badge is added.
- **History:** IntentCard came from `59eb758` and `4c48764` (plans 0002/0003). SymbolRow comes from plan 0011 (uncommitted). No earlier work on paging chips was found.
- **Assumptions:**
  - The button label counts what the next click reveals (`min(10, remaining)`). With 32 endpoints it reads "Show 10 more endpoints" twice, then "Show 2 more endpoints", then "Show less".
  - The Re-derive button and stale badge stay, moved into the `SectionLabel` `right` slot. The mockup leaves them out, but the brief keeps behaviour unchanged.

## Modules & files
### client
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/_components/SymbolTree/SymbolRow.tsx:68-89`: limit the endpoint chips to 10, plus the show more / show less button.
- `…/BlastRadiusCard/_components/SymbolTree/constants.ts`: **new**. `ENDPOINT_CHIPS_PAGE = 10`.
- `…/BlastRadiusCard/_components/SymbolTree/styles.ts:62-71`: add a `showMore` style next to `chips`/`chipGroup`.
- `client/messages/en/blast.json:7-10`: add `showMoreEndpoints` (ICU plural) and `showLessEndpoints`.
- `…/BlastRadiusCard/BlastRadiusCard.test.tsx`: new chip-limit cases. SymbolRow has no test file of its own; it is tested through the card.
- `…/_components/IntentCard/IntentCard.tsx:36-81`: move the label into `Card` as a `SectionLabel`, and add the same label to the empty state.
- `…/_components/IntentCard/styles.ts:4-25,35,44-61`: delete the old header styles, change the undefined `--text`, and update label and list sizes.
- `…/IntentCard/_components/RiskAreas/styles.ts:16,21,32-33`: row padding, gap, title weight and colour token.
- `…/IntentCard/_components/RiskAreas/RiskRow.tsx:45,54`: glyph size and `IconBtn` size.
- `client/messages/en/intent.json`: delete `chipLabel`, which is no longer used after Step 4.

## Component map
| Module | Component | Status | Layer | Path | Depends on | Step |
|---|---|---|---|---|---|---|
| client | `SymbolRow` | changed | `_components` | `…/BlastRadiusCard/_components/SymbolTree/SymbolRow.tsx` | `ENDPOINT_CHIPS_PAGE`, `Button`, `Badge` | 2 |
| client | `ENDPOINT_CHIPS_PAGE` | new | `_components` (constants) | `…/SymbolTree/constants.ts` | — | 2 |
| client | `SymbolTree` | reused | `_components` | `…/SymbolTree/SymbolTree.tsx` | its React `key={symbolKey}` (`:25-28`) sets the identity of SymbolRow's state | — |
| client | `blast` messages | changed | i18n | `client/messages/en/blast.json` | — | 1 |
| client | `BlastRadiusCard` tests | changed | test | `…/BlastRadiusCard/BlastRadiusCard.test.tsx` | `SymbolRow` | 3 |
| client | `IntentCard` | changed | `_components` | `…/IntentCard/IntentCard.tsx`, `styles.ts` | `SectionLabel`, `Card` | 4 |
| client | `RiskRow` / `RiskAreas` styles | changed | `_components` | `…/IntentCard/_components/RiskAreas/RiskRow.tsx`, `styles.ts` | `IconBtn` | 5 |
| client | `intent` messages | changed | i18n | `client/messages/en/intent.json` | — | 4 |
| client | `IntentCard` / `RiskAreas` tests | reused | test | `IntentCard.test.tsx`, `RiskAreas.test.tsx` | — | 6 |

## Steps

1. **Add the i18n keys for the endpoint button** (module: `client`; depends on: —)
   - Change: in `blast.json`, after `"crons"` (line 8), add:
     - `"showMoreEndpoints": "{count, plural, one {Show # more endpoint} other {Show # more endpoints}}"`
     - `"showLessEndpoints": "Show less"`
     - Use the same ICU style as `callerCount` (line 21).
   - Files: `client/messages/en/blast.json`
   - Skills: `frontend-ui-architecture`
   - Verify: `pnpm typecheck` in `client/`

2. **Limit endpoint chips in `SymbolRow`** (module: `client`; depends on: 1)
   - Change:
     - New `SymbolTree/constants.ts` exporting `ENDPOINT_CHIPS_PAGE = 10` with a one-line doc comment.
     - In `SymbolRow`, add local `const [endpointLimit, setEndpointLimit] = React.useState(ENDPOINT_CHIPS_PAGE)`, with `import React from "react"` as in `PriorPrs.tsx:20`.
     - Compute these during render, never stored: `visible = impact.endpoints_affected.slice(0, endpointLimit)`, `remaining = total - visible.length`, `nextCount = Math.min(ENDPOINT_CHIPS_PAGE, remaining)`.
     - Map over `visible` instead of the whole array at `:72`.
     - Directly after the endpoints `role="group"` div (`:71-77`) and before the cron group, render `<Button kind="ghost" size="sm" type="button" style={s.showMore}>`:
       - if `remaining > 0`: label `t("showMoreEndpoints", { count: nextCount })`, `onClick` sets `l => l + ENDPOINT_CHIPS_PAGE`;
       - else if `total > ENDPOINT_CHIPS_PAGE`: label `t("showLessEndpoints")`, `onClick` resets to `ENDPOINT_CHIPS_PAGE`;
       - otherwise render nothing.
     - Add `showMore: { alignSelf: "flex-start" }` to `SymbolTree/styles.ts`.
     - Cron chips (`:79-87`) stay unchanged.
   - **Decision: endpoints only, crons unchanged.**
     - Crons have their own group and their own `.map` (`:79-87`), so the two can be handled separately.
     - Real data has 0 or 1 crons (the stats row in screenshot `05` reads "0 cron/jobs").
     - Handling both the same way would add a second state and message pair for a path nothing uses.
     - If crons ever overflow, pull out a shared chip-group child then. That follows the skill's "promote on the second consumer, not before" rule.
   - **Decision: local `useState<number>` in `SymbolRow`, not a parent `Set`.**
     - A `Set` only holds open or closed, and "reveal 10 more, repeatedly" needs a count.
     - The parent-owned `Set` pattern exists in `BlastRadiusCard.tsx:40,57-65` only because the default-open rows come from server order. Nothing in the parent needs this count.
     - Local state follows the codebase's own disclosure precedent (`PriorPrs.tsx:20`) and react-best-practices "colocate state".
     - Per-symbol identity is already guaranteed: `SymbolTree` keys each row by `symbolKey` (`SymbolTree.tsx:25-28`), the same key the `openSymbols` `Set` uses.
     - Behaviour: the limit survives collapsing and re-expanding a row, because the row stays mounted and only the body is conditional (`:45`). It resets on a Tree↔Graph toggle, because `SymbolTree` unmounts (`BlastRadiusCard.tsx:103-117`). Both are acceptable.
   - Files: `SymbolRow.tsx`, `SymbolTree/constants.ts` (new), `SymbolTree/styles.ts`
   - Skills: `frontend-ui-architecture`, `react-best-practices`
   - Verify: `pnpm typecheck` in `client/`

3. **Test the chip limit** (module: `client`; depends on: 2)
   - Change: add cases to `BlastRadiusCard.test.tsx`.
     - Override `BLAST.downstream[0].endpoints_affected` with 23 entries (`GET /e0` … `GET /e22`). Row 0 is open by default (first 3).
     - Count chips with `within(screen.getByRole("group", { name: "Endpoints" })).getAllByText(/^GET \/e/)`.
     - Expect 10 chips, then `fireEvent.click` the "Show 10 more endpoints" button: 20 chips.
     - Then "Show 3 more endpoints": 23 chips, and a "Show less" button.
     - Click it: 10 chips.
     - The cron chip is still shown throughout.
     - Second case: exactly 10 endpoints gives no `/show .* more|show less/i` button.
   - Use `fireEvent`; `@testing-library/user-event` is not installed and adding it would change the lock file.
   - Files: `…/BlastRadiusCard/BlastRadiusCard.test.tsx`
   - Skills: `react-testing-library`
   - Verify: `pnpm vitest run "src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard"` in `client/`

4. **Move the IntentCard label inside the card** (module: `client`; depends on: —)
   - Change (deltas D1–D6 below):
     - Delete the outside header (`IntentCard.tsx:57-80`). Make `<SectionLabel icon="Target" right={<div style={s.actions}>{stale badge}{Re-derive Button}</div>}>{t("chip")}</SectionLabel>` the first child of `<Card>` (before `:82`).
     - In the `!intent` branch (`:36-50`), add `<SectionLabel icon="Target">{t("chip")}</SectionLabel>` above `EmptyState`.
     - Import `SectionLabel` from `@devdigest/ui`, as `BlastRadiusCard.tsx:5` does.
     - Delete `s.header`, `s.chipWrap`, `s.chipIcon`, `s.chip` (`styles.ts:4-25`) and the `chipLabel` key in `intent.json`.
     - Apply D4–D6 to `styles.ts`.
   - Files: `IntentCard/IntentCard.tsx`, `IntentCard/styles.ts`, `client/messages/en/intent.json`
   - Skills: `frontend-ui-architecture`, `react-best-practices`
   - Verify: `pnpm typecheck` in `client/`

5. **Bring RiskRow in line with the SymbolRow style** (module: `client`; depends on: —)
   - Change: deltas D7–D10 in `RiskAreas/styles.ts` and `RiskRow.tsx`. No change to structure or roles.
   - Files: `IntentCard/_components/RiskAreas/styles.ts`, `RiskRow.tsx`
   - Skills: `frontend-ui-architecture`
   - Verify: `pnpm vitest run "src/app/repos/[repoId]/pulls/[number]/_components/IntentCard"` in `client/`

6. **Regression run, no new Intent tests** (module: `client`; depends on: 3, 4, 5)
   - Change: none expected. `IntentCard.test.tsx` queries text and button names only (`:68-100`). None of them target the removed `role="img"` or `aria-label="Derived intent"`, and `/derive intent/i` and `/re-derive/i` still match. Only if a test fails because of the move, update its query and nothing else.
   - Skills: `react-testing-library`
   - Verify: `pnpm test && pnpm typecheck` in `client/`

### Part B deltas (Intent before → Blast/reference target)
| # | Intent today | Blast / reference | Change |
|---|---|---|---|
| D1 | Label outside `Card`: `<section><div header/><Card>` (`IntentCard.tsx:56-81`). This pushes the Intent card ~40px below the Blast card in screenshot `05`. | `SectionLabel` is the first child inside `Card` (`BlastRadiusCard.tsx:72-73`); `06` shows "INTENT" inside the border | Use `SectionLabel icon="Target"` inside `Card`, with actions in the `right` slot (`SectionLabel.tsx:28`) |
| D2 | Label is orange: `color: var(--warn)` for icon and text (`IntentCard/styles.ts:17,24`), wrapped in `role="img"` (`IntentCard.tsx:58`) | Grey `var(--text-muted)`, 12px/700/`0.07em` uppercase (`SectionLabel.tsx:16-23`) | Comes from the `SectionLabel` primitive; delete the 4 old header styles |
| D3 | Empty state has no label (`IntentCard.tsx:39-48`) | Blast's error state still shows its label (`BlastRadiusCard.tsx:47-49`) | Add a `SectionLabel` above `EmptyState` |
| D4 | `sentence.color: "var(--text)"` (`IntentCard/styles.ts:35`), a token that is not defined anywhere | `var(--text-primary)` (`vendor/ui/styles.css:17`; `SymbolTree/styles.ts:24`) | `"var(--text)"` → `"var(--text-primary)"` |
| D5 | `columnLabel` fontSize `13`, letterSpacing `"0.06em"` (`IntentCard/styles.ts:48,50`) | `12` / `"0.07em"` (`SectionLabel.tsx:19,21`); `06` shows IN SCOPE the same size as INTENT | `13` → `12`, `"0.06em"` → `"0.07em"`; colours stay (`ok` / `text-muted`, as in `06`) |
| D6 | `list.fontSize: 13.5`, block list (`IntentCard/styles.ts:55-61`) | Caller rows are `fontSize: 13` in a flex column with `gap: 4` (`SymbolTree/styles.ts:41-54`) | `13.5` → `13`; add `display: "flex", flexDirection: "column", gap: 4`. The missing-context list shares it, which is fine |
| D7 | Risk row `padding: "10px 12px"` (`RiskAreas/styles.ts:16`) | `"8px 10px"` (`SymbolTree/styles.ts:12`) | Match |
| D8 | `rowHeader.gap: 10` (`RiskAreas/styles.ts:21`) | `8` (`SymbolTree/styles.ts:17`) | Match |
| D9 | `title` weight `700`, colour `var(--text)`, undefined (`RiskAreas/styles.ts:32-33`) | `600`, `var(--text-primary)` (`SymbolTree/styles.ts:23-24`) | Match both |
| D10 | Kind glyph `size={15}`; `IconBtn` default size 30 (`RiskRow.tsx:45,54`; `IconBtn.tsx:7`) | Glyph `size={14}`, `IconBtn size={26}` (`SymbolRow.tsx:31,36`) | `15` → `14`; add `size={26}` |

**Already aligned, no change:**
- The `Card` primitive and its padding.
- Row list gap `8`, row `1px solid var(--border)` and radius `8` (`RiskAreas/styles.ts:8-15` vs `SymbolTree/styles.ts:4-13`).
- Section dividers: `risksWrap`/`missing` (`IntentCard/styles.ts:77-86`) vs `PriorPrs` footer (`PriorPrs/styles.ts:4-8`), within 2px.
- Placeholders: 13px muted on both sides.
- The italic sentence, which matches `06`.
- The risk expand body keeps its top rule (`RiskAreas/styles.ts:35-39`), because it holds prose, not a caller list.

## Skills for implementer
| Step | Skill | Rule from the skill that governs this step |
|---|---|---|
| 1, 4 | `frontend-ui-architecture` | User-facing text lives in i18n message files, never in `constants.ts` |
| 2 | `frontend-ui-architecture` | A literal used by one component goes in that folder's `constants.ts`; styles stay beside the component |
| 2 | `react-best-practices` | Derive, don't store: `visible`/`remaining`/`nextCount` are computed during render; only the limit is state. Colocate state in the lowest component that reads it |
| 4 | `react-best-practices` | Conditional rendering: keep `stale && …` boolean-guarded; never guard with a number |
| 3, 6 | `react-testing-library` | Query by role/name first (`getByRole("group"/"button", { name })`); test behaviour, not styles |

## Architecture constraints
- Client-only. No change to `server/`, `mcp/`, `reviewer-core/`, or either `vendor/shared` copy.
- Import UI only from the `@devdigest/ui` barrel (`client/AGENTS.md:36`). Import shared contracts as types only.
- Tests stay colocated `*.test.tsx`. No new dependencies, so no lock file changes.

## Do-not-touch that this task hits
- None.

## Verification (whole task)
- `client`: `pnpm test`. A pass means all vitest suites are green, including the new chip-limit cases and the unchanged Intent and RiskAreas tests.
- `client`: `pnpm typecheck`. A pass means `tsc` is clean.
- Manual, if a dev server is available: load a PR Overview.
  - Both cards' top borders line up.
  - "INTENT" is grey inside the card.
  - `buildApp()` shows 10 chips and "Show 10 more endpoints".
  - If the implementer cannot load the page, report it as *Not verified*.

## Risks
- A `size="sm"` Re-derive Button in the `SectionLabel` row is taller than the Blast label row, so Intent content may start a few px lower. This is cosmetic; check visually and don't restyle the Button.
- The endpoint limit resets on a Tree↔Graph toggle (a design choice in Step 2). Mention it if reviewers ask.
- Deleting `chipLabel` is safe: it is only used at `IntentCard.tsx:58`, and `en` is the only locale.

## Open questions
- None.

## Could not establish
- The exact pixel spacing in `06`. It is a mockup screenshot, so the deltas use existing Blast tokens rather than measuring pixels.
- The intended placement of Re-derive, which the mockup leaves out. The plan defaults to the `SectionLabel` `right` slot.

## Insight candidates
- `var(--text)` is not a defined CSS token; only `--text-primary`, `--text-secondary` and `--text-muted` exist (`client/src/vendor/ui/styles.css:17-19`). An invalid `var()` silently falls back to the inherited colour, so neither `tsc` nor the tests catch it. It was used in `IntentCard/styles.ts:35` and `RiskAreas/styles.ts:33`.
- `@testing-library/user-event` is not a client dependency, so component tests use `fireEvent`.
