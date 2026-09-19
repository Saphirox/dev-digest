# Severity rubric

One rubric for every reviewer, because `critical` blocks the PR. A skill's
own wording ("never", "must", "anti-pattern") does not set severity. The
**consequence** of the change does.

## critical: blocks the PR

Every item must name a concrete failure that the changed code causes: what
input or state leads to what wrong outcome. Each item needs all of:

- `rule`: the exact source, e.g. `onion-architecture/SKILL.md#the-dependency-rule`,
  `security/checklists.md#injection`, or `CLAUDE.md#do-not-touch`.
- `evidence`: the offending code, quoted from the **added lines** of the diff.
- `failure_scenario`: input or state, then the wrong behavior (crash, data
  loss, leaked secret, wrong result, broken build or CI).

Missing any one of them makes the verdict script downgrade it to `warning`.
So does a line that is not in the diff.

Qualifies:
- A correctness bug on a reachable path, such as wrong results, a crash, an
  unhandled rejection that kills the request, or a lost write.
- Security: injection (SQL, shell, path), a secret reaching the client or
  logs, an auth or authorization gap, XSS through `dangerouslySetInnerHTML`
  with untrusted data, SSRF from a user-supplied URL.
- Data integrity: a migration that loses data, a missing transaction around
  writes that must be atomic, a schema change that breaks existing rows.
- A hard repo rule: an onion ring import pointing outward (a route or
  service querying Drizzle, reviewer-core importing server code),
  `vendor/shared` changed on one side only, an edited merged migration.
- A contract break: an API response shape that the client's zod schema will
  reject, or a removed field that is still read.
- A React correctness bug with a visible failure: a hook called
  conditionally, state mutated in place so the UI goes stale, an effect
  that loops forever, a server-only import in a client component that
  breaks the build.

## warning: should fix, does not block

A convention or maintainability problem with no demonstrated failure. For
example: a file in the wrong place, a helper left inside a component, a
missing test for changed behavior, weak typing (`any`, a non-null `!`), a
missing index on a new query path, an N+1 query on a small bounded list,
naming drift, or duplicated logic.

## suggestion

Style, readability, and optional modernisation.

## Calibration

- "The skill says never do X" is not enough for critical. Ask what breaks.
  If you cannot write the failure scenario in one sentence, use `warning`.
- Pre-existing code is out of scope, even when it is bad. Flag only what
  the added lines introduce or newly expose.
- Do not report what the deterministic checks already prove. That covers
  migrations, lockfiles, vendor/shared drift, secrets, `.it.test.ts`
  naming, and dependency-cruiser edges. Duplicates add noise without new
  information.
- Prefer one precise critical over several speculative ones. A false
  critical costs the author a blocked PR. A missed warning costs little.
