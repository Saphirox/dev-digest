# repo-intel — Insights

Append-only log of non-obvious lessons from working in this module, written
for the next agent. Agents append via the `engineering-insights` skill
(`.claude/skills/engineering-insights/`); humans prune. A lesson that keeps
coming back graduates into this module's AGENTS.md as a standing rule.

## What Works

## What Doesn't Work

## Codebase Patterns
- 2026-09-19 · Don't assume reviews read only the persistent index — `getCallerSignatures` still re-parses the clone with ast-grep and uses ripgrep `codeIndex.references()` per review; only `getRepoMap`/`getFileRank`/persistent blast are pure DB reads. `service.ts` (`getCallerSignatures`)
- 2026-09-19 · Incremental refresh is keyed by `git diff lastIndexedSha..HEAD`, not by `content_hash` — the hash is written to `symbols`/`references` but never compared. `pipeline/incremental.ts` (`runIncremental`)
- 2026-09-19 · `getRepoMap` only hits for budget 1500 at `lastIndexedSha`; any other budget, or a full index where `currentHead` failed (empty SHA), returns degraded. `service.ts` (`getRepoMap`), `pipeline/full.ts`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
- 2026-09-19 · Does incremental double-count `filesIndexed`? It adds the re-parsed slice to the prior total, so a modified (already-counted) file is counted twice. Seen at `pipeline/incremental.ts:260`. Next step: count only newly-added paths, or recount from `symbols`.
