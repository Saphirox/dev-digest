/**
 * Deterministic Risk Areas detectors — diff → Risk[], no model call (see the
 * risk-source ADR in `docs/plans/0003-intent-card-risk-areas.md`). Every ref
 * is built ONLY from `addedLines` tuples, and `groundRisks` re-checks every
 * ref against `buildLineIndex` before it can leave `deriveRisks` — the same
 * mechanical gate `groundFindings` applies to model-produced findings.
 *
 * `explanation` text is built from typed fields only (file path, line range,
 * dependency name, pattern label) — NEVER the raw matched diff line, which
 * can contain a secret. For `new_dependency` specifically, "dependency name"
 * and "version" are only ever the regex-captured groups AFTER they pass
 * `DEP_VALUE_RE` (a strict, fully-anchored dependency-range/specifier shape)
 * — an arbitrary value (an npm script command, an auth token) never matches
 * that shape, so it can never reach `explanation`. See Finding 1 in the plan.
 */
import type { Risk, RiskRef, UnifiedDiff } from '@devdigest/shared';
import { buildLineIndex } from '@devdigest/reviewer-core';
import { walkDiff } from '../../../lib/diff-lines.js';
import { addedLines, toRanges, type AddedLine } from './helpers.js';
import {
  AUTH_PATH_RE,
  DEP_BLOCK_KEYS,
  DEP_LINE_RE,
  DEP_VALUE_RE,
  MANIFEST_BASENAMES,
  MAX_REFS_PER_RISK,
  MAX_RISKS,
  NON_DEP_KEYS,
  PERF_PATTERNS,
  REQUEST_PATH_RE,
} from './constants.js';

function isManifestFile(path: string): boolean {
  return MANIFEST_BASENAMES.some((base) => path === base || path.endsWith(`/${base}`));
}

// ---------------------------------------------------------------------------
// auth_surface — one aggregated risk when any added line lives in a file
// matching AUTH_PATH_RE.
// ---------------------------------------------------------------------------

function detectAuthSurface(added: AddedLine[]): Risk | null {
  const linesByFile = new Map<string, number[]>();
  for (const l of added) {
    if (!AUTH_PATH_RE.test(l.path)) continue;
    const arr = linesByFile.get(l.path) ?? [];
    arr.push(l.line);
    linesByFile.set(l.path, arr);
  }
  if (linesByFile.size === 0) return null;

  const refs: RiskRef[] = [];
  outer: for (const [file, lines] of linesByFile) {
    for (const r of toRanges(lines)) {
      refs.push({ file, start_line: r.start, end_line: r.end });
      if (refs.length >= MAX_REFS_PER_RISK) break outer;
    }
  }

  const files = Array.from(linesByFile.keys());
  const preview = files.slice(0, 3).join(', ') + (files.length > 3 ? ', …' : '');

  return {
    kind: 'auth_surface',
    title: 'Auth surface touched',
    explanation: `Added lines touch ${files.length} auth-related file${files.length === 1 ? '' : 's'} (${preview}) — review authentication/authorization changes carefully.`,
    severity: 'high',
    refs,
  };
}

// ---------------------------------------------------------------------------
// new_dependency — one risk PER dependency added to a package.json manifest.
// A key that also appears on a removed line of the same file is a version
// bump, not a new dependency, and is excluded.
//
// Two independent gates, both required (Finding 1):
//   1. `DEP_VALUE_RE` — the value must fully match a dependency-range or
//      specifier shape. A script command or a secret never matches, so it
//      never reaches `explanation`.
//   2. `enclosingBlockKey` — when the hunk's context lines make the
//      surrounding JSON block visible, it must be one of `DEP_BLOCK_KEYS`.
//      When the block can't be determined from the visible context, this
//      falls back to gate 1 alone rather than guessing.
// `NON_DEP_KEYS` is a secondary backstop only, for root-level keys (like
// `version`) whose enclosing block is rarely visible in a small diff hunk.
// ---------------------------------------------------------------------------

/** Keys removed from a manifest file (by a `-` line matching `DEP_LINE_RE`). */
function removedManifestKeys(raw: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();

  for (const event of walkDiff(raw)) {
    if (event.type !== 'line' || event.kind !== 'del') continue;
    if (!isManifestFile(event.path)) continue;

    const m = event.text.match(DEP_LINE_RE);
    const key = m?.[1];
    if (!key || NON_DEP_KEYS.has(key)) continue;
    const set = out.get(event.path) ?? new Set<string>();
    set.add(key);
    out.set(event.path, set);
  }

  return out;
}

const BLOCK_OPEN_RE = /^\s*"([^"]+)"\s*:\s*\{\s*$/;
const BLOCK_CLOSE_RE = /^\s*\}\s*,?\s*$/;

/**
 * Find the JSON object key enclosing `precedingLines` — the current hunk's
 * add+context lines seen so far, in new-file order — by walking backward and
 * tracking brace balance: each `}` means we're skipping a sibling block that
 * already closed before reaching us; the first un-skipped `"key": {` opener
 * is the enclosing block. Returns null when the search runs out of visible
 * context first — "can't be determined from the diff", never a guess.
 */
function enclosingBlockKey(precedingLines: string[]): string | null {
  let pending = 0;
  for (let i = precedingLines.length - 1; i >= 0; i--) {
    const line = precedingLines[i];
    if (line === undefined) continue;
    if (BLOCK_CLOSE_RE.test(line)) {
      pending++;
      continue;
    }
    const m = line.match(BLOCK_OPEN_RE);
    if (m?.[1] !== undefined) {
      if (pending === 0) return m[1];
      pending--;
    }
  }
  return null;
}

function detectNewDependencies(raw: string): Risk[] {
  const removedByFile = removedManifestKeys(raw);
  const risks: Risk[] = [];

  let path = '';
  let hunkLines: string[] = [];

  for (const event of walkDiff(raw)) {
    if (event.type === 'file') {
      path = event.path;
      hunkLines = [];
      continue;
    }
    if (event.type === 'hunk') {
      hunkLines = []; // block context never crosses a hunk boundary — the diff has no visibility into the gap
      continue;
    }
    if (event.kind === 'del' || !isManifestFile(path)) continue;

    if (event.kind === 'add') {
      const m = event.text.match(DEP_LINE_RE);
      const name = m?.[1];
      const version = m?.[2];
      if (
        name &&
        version !== undefined &&
        !NON_DEP_KEYS.has(name) &&
        DEP_VALUE_RE.test(version) &&
        !removedByFile.get(path)?.has(name) // version bump, not new
      ) {
        const block = enclosingBlockKey(hunkLines);
        if (block === null || DEP_BLOCK_KEYS.has(block)) {
          risks.push({
            kind: 'new_dependency',
            title: `New dependency: ${name}`,
            explanation: `${path} adds a new dependency "${name}" at version "${version}".`,
            severity: 'medium',
            refs: [{ file: path, start_line: event.line as number, end_line: event.line as number }],
          });
        }
      }
    }

    hunkLines.push(event.text);
  }

  return risks;
}

// ---------------------------------------------------------------------------
// performance — one risk per (pattern label, file) where an added line
// matches a PERF_PATTERNS entry AND the file matches REQUEST_PATH_RE.
// ---------------------------------------------------------------------------

function detectPerformance(added: AddedLine[]): Risk[] {
  const seen = new Map<string, { file: string; label: string; lines: number[] }>();

  for (const l of added) {
    if (!REQUEST_PATH_RE.test(l.path)) continue;
    for (const p of PERF_PATTERNS) {
      if (!p.re.test(l.text)) continue;
      const key = `${p.label}\u0000${l.path}`;
      const entry = seen.get(key) ?? { file: l.path, label: p.label, lines: [] };
      entry.lines.push(l.line);
      seen.set(key, entry);
    }
  }

  const risks: Risk[] = [];
  for (const { file, label, lines } of seen.values()) {
    const refs = toRanges(lines)
      .slice(0, MAX_REFS_PER_RISK)
      .map((r) => ({ file, start_line: r.start, end_line: r.end }));
    risks.push({
      kind: 'performance',
      title: `Adds ${label} round-trip per request`,
      explanation: `${file} adds a ${label} call in a request-handling path — each request now pays for an extra round-trip.`,
      severity: 'medium',
      refs,
    });
  }
  return risks;
}

// ---------------------------------------------------------------------------
// groundRisks — the mandatory mechanical gate: drop any ref that does not
// intersect a real hunk (via `buildLineIndex`, the same index `groundFindings`
// uses), then drop any risk left with no refs. Cap at MAX_RISKS.
// ---------------------------------------------------------------------------

export function groundRisks(risks: Risk[], diff: UnifiedDiff): Risk[] {
  const lineIndex = buildLineIndex(diff);
  const out: Risk[] = [];

  for (const risk of risks) {
    const kept = risk.refs.filter((ref) => {
      const lines = lineIndex.get(ref.file);
      if (!lines) return false;
      const lo = Math.min(ref.start_line, ref.end_line);
      const hi = Math.max(ref.start_line, ref.end_line);
      for (let n = lo; n <= hi; n++) if (lines.has(n)) return true;
      return false;
    });
    if (kept.length === 0) continue;
    out.push({ ...risk, refs: kept });
    if (out.length >= MAX_RISKS) break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// deriveRisks — the entry point: run all 3 detectors, then ground the result.
// ---------------------------------------------------------------------------

export function deriveRisks(diff: UnifiedDiff): Risk[] {
  const added = addedLines(diff.raw);

  const risks: Risk[] = [];
  const auth = detectAuthSurface(added);
  if (auth) risks.push(auth);
  risks.push(...detectNewDependencies(diff.raw));
  risks.push(...detectPerformance(added));

  return groundRisks(risks, diff);
}
