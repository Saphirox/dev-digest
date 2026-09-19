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
- Component/interaction tests mock `fetch`; they intentionally don't need the
  API running. Full client+API+DB journeys live in [`../e2e`](../e2e/README.md),
  not here.

## Gotchas

- The UI route map (which route calls which API endpoint) is in
  [README.md](README.md#ui-route-map) — read it before wiring a new page to
  the API rather than guessing the endpoint shape.

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
