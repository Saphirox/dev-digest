---
name: semver-discipline
description: When the diff changes a public contract, decide which version bump it forces and check the change carries it.
type: rubric
---

## Which bump does this change force?

Decide the bump from the CALLER's perspective, never from the size of the diff.
A one-line change can be major; a 400-line refactor is usually patch.

**MAJOR — an existing caller must change to keep working**
- A removed, renamed, or retyped field on a request or response.
- A new required input, or an optional input made required.
- A narrowed enum, tightened validation, changed status code or error shape.
- A changed route path, method, parameter name or order.
- A removed exported symbol, or a changed signature of one.

**MINOR — new surface, nothing existing moves**
- A new route, a new optional request field, a new response field.
- A new enum member on OUTPUT only. (On input it is minor; on output it is major
  for any consumer that exhaustively switches — say so and let the author decide.)

**PATCH — no observable contract change**
- Internal refactor, performance work, comment and test changes, a bug fix that
  makes behaviour match the documented contract.

### What to report

A major-forcing change is only complete when the version moves with it. Check the
package manifest in the diff, or say plainly that it is missing:

### Bad — major change, patch bump

```diff
-  "version": "2.4.1",
+  "version": "2.4.2",
...
-  status: z.enum(['open', 'merged', 'closed']),
+  status: z.enum(['open', 'merged']),
```

A caller sending `closed` now gets a validation error from a patch release.

### Good — the bump matches the break

```diff
-  "version": "2.4.1",
+  "version": "3.0.0",
```

If the repo is pre-1.0 or unversioned, say which bump the change WOULD force and
what the release note must tell callers — do not skip the finding for lack of a
version field.
