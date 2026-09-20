/**
 * Pure helpers for the Intent Layer (no I/O imports — no DB, fs, GitHub, or
 * container). Every function here operates only on its arguments.
 */
import { posix } from 'node:path';
import type { PrIntentRecord } from '@devdigest/shared';
import { MAX_DOC_LINKS, MAX_FILES, MAX_HUNKS_PER_FILE } from './constants.js';

// ---------------------------------------------------------------------------
// hunkHeaders — the "no diff body reaches the classifier" boundary.
//
// Re-scans a raw unified diff for `@@ … @@` hunk header lines ONLY, attributing
// each to the preceding `+++ b/<path>` marker. It NEVER reads/returns a `+`,
// `-`, or context line — those never leave this function. Capped per file
// (`MAX_HUNKS_PER_FILE`) and per diff (`MAX_FILES`) so a huge PR stays a
// bounded classifier request.
// ---------------------------------------------------------------------------

export interface FileHunkHeaders {
  path: string;
  /** `@@ -a,b +c,d @@ ...` lines, capped at `maxHunksPerFile`. */
  headers: string[];
}

const HUNK_HEADER_RE = /^@@[^\n]*@@.*$/;

export function hunkHeaders(
  raw: string,
  opts: { maxFiles?: number; maxHunksPerFile?: number } = {},
): FileHunkHeaders[] {
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const maxHunksPerFile = opts.maxHunksPerFile ?? MAX_HUNKS_PER_FILE;

  const out: FileHunkHeaders[] = [];
  let current: FileHunkHeaders | null = null;

  for (const line of raw.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '').trim();
      if (path === '/dev/null') {
        current = null;
        continue;
      }
      current = out.find((f) => f.path === path) ?? null;
      if (!current) {
        if (out.length >= maxFiles) continue; // over the file cap — drop silently
        current = { path, headers: [] };
        out.push(current);
      }
      continue;
    }
    if (current && HUNK_HEADER_RE.test(line) && current.headers.length < maxHunksPerFile) {
      current.headers.push(line.trim());
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// extractIssueRef — same rule as the GitHub adapter's private linked-issue
// resolver (`octokit.ts:127`), which cannot be reused (module-private).
// ---------------------------------------------------------------------------

const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

export function extractIssueRef(title: string, body: string | null): number | null {
  const text = `${title}\n${body ?? ''}`;
  const m = text.match(ISSUE_REF_RE);
  return m?.[1] ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// extractDocLinks — repo-relative docs/specs markdown paths, and markdown
// link targets; http(s):// targets are classified `external_link`.
// ---------------------------------------------------------------------------

export interface DocLink {
  kind: 'repo_file' | 'external_link';
  ref: string;
}

const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const BARE_DOC_PATH_RE = /\b((?:docs|specs)\/[\w./-]+\.md)\b/g;

/**
 * The ONE allowlist for a repo-relative doc ref: must normalise (via
 * `path.posix.normalize`, so `docs/../../etc/x.md` is caught, not just a
 * literal leading `..`) to a `docs/`|`specs/`-rooted `.md` path with no
 * escaping `..` segment and no absolute leading `/`. Shared by BOTH the
 * markdown-link and bare-path branches below — the path-traversal bug this
 * fixes was exactly that only the bare-path branch was constrained; a
 * markdown link accepted any `.md` target, so `[spec](../../../../etc/passwd.md)`
 * reached `readFile` untouched.
 */
function sanitizeDocRef(target: string): string | null {
  const normalized = posix.normalize(target);
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) return null;
  if (!/\.md$/i.test(normalized)) return null;
  if (!/^(?:docs|specs)\//.test(normalized)) return null;
  return normalized;
}

export function extractDocLinks(body: string | null, opts: { max?: number } = {}): DocLink[] {
  if (!body) return [];
  const max = opts.max ?? MAX_DOC_LINKS;
  const found: DocLink[] = [];
  const seen = new Set<string>();

  const add = (link: DocLink) => {
    if (seen.has(link.ref)) return;
    seen.add(link.ref);
    found.push(link);
  };

  for (const m of body.matchAll(MD_LINK_RE)) {
    const target = m[1]!.trim();
    if (/^https?:\/\//i.test(target)) {
      add({ kind: 'external_link', ref: target });
      continue;
    }
    const safe = sanitizeDocRef(target);
    if (safe) add({ kind: 'repo_file', ref: safe });
  }
  for (const m of body.matchAll(BARE_DOC_PATH_RE)) {
    const safe = sanitizeDocRef(m[1]!);
    if (safe) add({ kind: 'repo_file', ref: safe });
  }

  return found.slice(0, max);
}

// ---------------------------------------------------------------------------
// clampConfidence — mirrors `adjustConfidence` in `conventions/helpers.ts`:
// the model's self-reported number is a ceiling, never trusted outright when
// evidence is thin.
// ---------------------------------------------------------------------------

export interface ConfidenceAvailability {
  /** The PR has a non-empty body. Default true (assume present). */
  hasBody?: boolean;
  /** At least one evidence source (issue, doc, external link) was unreachable. */
  anyUnreachable?: boolean;
  /** A linked issue OR a readable doc was found. Default true (assume present). */
  hasIssueOrDoc?: boolean;
}

export function clampConfidence(self: number, avail: ConfidenceAvailability): number {
  const hasBody = avail.hasBody ?? true;
  const anyUnreachable = avail.anyUnreachable ?? false;
  const hasIssueOrDoc = avail.hasIssueOrDoc ?? true;

  let cap = 1;
  if (!hasBody) cap = Math.min(cap, 0.5);
  if (anyUnreachable) cap = Math.min(cap, 0.6);
  if (!hasIssueOrDoc) cap = Math.min(cap, 0.75);

  const clamped = Math.min(Math.max(0, self), cap);
  return Math.round(clamped * 100) / 100;
}

// ---------------------------------------------------------------------------
// renderIntentBlock — the `intent` prompt slot's payload (reviewer-core wraps
// it in `<untrusted source="intent">` and adds the advisory line; see
// `reviewer-core/src/prompt.ts`).
// ---------------------------------------------------------------------------

export function renderIntentBlock(record: PrIntentRecord): string {
  const lines: string[] = [record.intent];

  if (record.in_scope.length > 0) {
    lines.push('', 'In scope:', ...record.in_scope.map((s) => `- ${s}`));
  }
  if (record.out_of_scope.length > 0) {
    lines.push('', 'Out of scope:', ...record.out_of_scope.map((s) => `- ${s}`));
  }
  if (record.missing_context.length > 0) {
    lines.push('', ...record.missing_context.map((ref) => `Missing context: ${ref} — not retrievable`));
  }
  return lines.join('\n');
}
