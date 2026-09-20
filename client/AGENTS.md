# client — `@devdigest/web`

Next.js 15 studio: import repos, browse PRs, run/read AI reviews, author
agents. Full picture: [README.md](README.md).

## Stack

Next.js 15 (App Router), React 19, TanStack Query, `next-intl` (messages in
`messages/<locale>/*.json`), `recharts`, `mermaid`, `react-markdown`. UI
primitives vendored under `src/vendor/ui` (`@devdigest/ui`), shared Zod
contracts under `src/vendor/shared` (`@devdigest/shared`).

## Commands

```sh
pnpm dev         # :3000
pnpm test         # vitest + jsdom, fetch mocked — no API/browser needed
pnpm typecheck
```

## Map

- `src/app/**/page.tsx` — routes (`repos`, `agents`, `settings`, `onboarding`);
  pages are thin, feature logic sits in colocated `_components/<Name>/`
  folders each with its own `*.test.tsx`.
- `src/lib/api.ts` + `src/lib/hooks/*` — every data fetch goes through a hook
  here, backed by `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- `src/components/app-shell` — cross-cutting chrome (nav, breadcrumbs,
  `g`-then-key shortcuts).
- `src/vendor/ui` (`@devdigest/ui`) — component library, one barrel import.
- `src/vendor/shared` — **non-canonical copy** of shared contracts (see root
  [AGENTS.md](../AGENTS.md)).

## Non-default conventions

- **Always import UI from the barrel** — `import { Button } from
  "@devdigest/ui"`, never reach into `src/vendor/ui/<layer>/*` directly.
- `src/vendor/shared` is a manually-synced copy of `server/src/vendor/shared`,
  not an alias to it — it can lag behind server (missing later-lesson
  contracts). Diff before assuming parity.
- **Import shared contracts as types only** — `import type { Finding } from
  "@devdigest/shared"`. A runtime import (e.g. reading `SkillType.options`)
  500s the page under `next dev` with `Module not found: Can't resolve
  './contracts/findings.js'`: the vendored index uses `.js` specifiers webpack
  can't resolve. `tsc` and `pnpm test` both pass — only a real page load
  catches it. Derive runtime lists from a local `Record<Union, …>`.
- Component/interaction tests mock `fetch`; they intentionally don't need the
  API running. Full client+API+DB journeys live in [`../e2e`](../e2e/README.md),
  not here.

## Gotchas

- The UI route map (which route calls which API endpoint) is in
  [README.md](README.md#ui-route-map) — read it before wiring a new page to
  the API rather than guessing the endpoint shape.
- **`React.useEffectEvent` is a trap here.** It type-checks and passes vitest
  (`node_modules/react` is 19.2.7) but crashes in the browser with
  `useEffectEvent is not a function` — Next 15.5's App Router runs its own
  bundled React. Hold the latest values in a ref instead. Re-check when Next
  vendors React ≥ 19.2.
- **`@devdigest/ui` has two form traps.** `Button` sets no default `type`, so
  any `Button` inside a `<form>` (e.g. Cancel) submits it — pass
  `type="button"`. `Modal` gives its children no padding (`Drawer` does); wrap
  a form in a `{ padding: 24 }` div.
- **null ≠ 0 in run usage.** Unknown cost renders "—"; unknown tokens drop the
  whole "N tok · " segment. Never `?? 0` a cost or token field — the server
  enforces the same rule in SQL (`SUM` skips NULLs). It's a product contract,
  not a formatting choice.

## Do not touch

- `src/vendor/shared/**` — see root AGENTS.md; don't "fix" a missing contract
  here without checking if it simply hasn't reached this copy yet.
- `src/vendor/ui/**` internals from outside the barrel.

## Docs

[README.md](README.md) (UI route map) · [docs/](docs/) · [specs/](specs/) ·
[INSIGHTS.md](INSIGHTS.md) · [../TESTING.md](../TESTING.md)

## Insights

Lessons from past sessions: [INSIGHTS.md](INSIGHTS.md). If you haven't
read it in this task yet, read it now — before changing or explaining
anything here (see *Insights loop* in the root [AGENTS.md](../AGENTS.md)).
