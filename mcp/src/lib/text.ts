/**
 * Pure text helpers, no I/O. Deliberately placed outside `modules/` and
 * `adapters/` (precedent: `server/src/lib/diff-lines.ts:14-19`) so both a
 * pure domain file (`helpers.ts`, `render.ts`) and an infrastructure file
 * (`adapters/devdigest-api/client.ts`, a `repository.ts`, any
 * `modules/_shared/*` file) can import it without the other picking up a
 * cross-ring dependency. A `lib` file may import nothing internal and
 * nothing but `zod` (`test/architecture.test.ts`'s `lib` kind) — `truncate`
 * needs neither, so this file has no imports at all.
 *
 * Replaces 4 near-identical copies that predated this file (2026-09-26
 * contracts-hygiene pass): `agents/helpers.ts`, `reviews/helpers.ts`,
 * `adapters/devdigest-api/client.ts`, `modules/_shared/messages.ts` — each
 * used to justify its own copy by "no ring all four could jointly import
 * from without widening the allowlist"; `lib/` is that ring, added instead
 * of widening any existing one.
 */
export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
