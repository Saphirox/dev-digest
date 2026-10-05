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

- 2026-10-03 · Blast Radius shows `N symbols, 0 callers` on a repo whose index state is `full` → `SELECT count(*), count(decl_file) FROM "references" WHERE repo_id=…`; `count(decl_file)=0` means an index run died between writing symbols/references and `resolveReferences` (here: the API crash), leaving only the first 500-row chunk of `file_edges`. `POST /repos/:id/resync` is a no-op while HEAD == `lastIndexedSha`; force a full re-index with `UPDATE repo_index_state SET indexer_version = 0 WHERE repo_id=…` then resync — root cause: `getResolvedCallers` joins on `decl_file`, which only `resolveReferences` fills. `repository.ts` (`getResolvedCallers`, `resolveReferences`), `pipeline/incremental.ts` (`runIncremental` version check)

## Session Notes

- 2026-10-03 · Diagnosed empty Blast Radius after an API crash (unresolved `decl_file`), forced a full re-index; +2 insights (Recurring Errors & Fixes, Open Questions)

## Open Questions
- 2026-09-19 · Does incremental double-count `filesIndexed`? It adds the re-parsed slice to the prior total, so a modified (already-counted) file is counted twice. Seen at `pipeline/incremental.ts:260`. Next step: count only newly-added paths, or recount from `symbols`.
- 2026-10-03 · Why do several index jobs start for one repo within the same second (seen: clone, `repo-intel-index` ×3, `repo-intel-refresh` ×2 at 08:11:29–30 in `jobs`)? Concurrent full indexes race on the `symbols` unique key — that race, not only a parser double-emit, is a likely source of the duplicate-key crash. Seen at `server/src/modules/repos/service.ts:69,130`. Next step: dedupe/serialise index enqueues per repo.
