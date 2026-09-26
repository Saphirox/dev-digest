/** Pure helpers for the SmartDiffViewer (no React). */
import type { FindingRecord, ReviewRecord, Severity, SmartDiffFile } from "@devdigest/shared";
import { lineKey } from "@/components/diff-viewer";
import { latestFindingsPerAgent } from "@/lib/latest-findings";
import { SEVERITIES } from "@/lib/severity";

/** Position in `SEVERITIES` (worst first); unrecognised sorts after all of them. */
function rank(sev: string): number {
  const i = (SEVERITIES as readonly string[]).indexOf(sev);
  return i === -1 ? SEVERITIES.length : i;
}

/** The worse of two severities (lower `SEVERITIES` index wins). */
function worseOf(a: Severity, b: Severity): Severity {
  return rank(a) <= rank(b) ? a : b;
}

/**
 * Build a `path -> (new-side line -> worst severity)` map, keyed on
 * `start_line` only (no range expansion — Decision 7) and skipping dismissed
 * findings (Decision 6: a dismissed finding gets no line bar/label). On a
 * shared line the worse severity wins. This is *colour only* — the set of
 * flagged lines comes from the server's `finding_lines`, never from here (see
 * `severityForFlaggedLines`).
 */
export function buildSeverityByFile(reviews: ReviewRecord[]): Map<string, Map<number, Severity>> {
  const byFile = new Map<string, Map<number, Severity>>();
  for (const finding of latestFindingsPerAgent(reviews)) {
    if (finding.dismissed_at) continue;
    const byLine = byFile.get(finding.file) ?? new Map<number, Severity>();
    const existing = byLine.get(finding.start_line);
    byLine.set(finding.start_line, existing ? worseOf(existing, finding.severity) : finding.severity);
    byFile.set(finding.file, byLine);
  }
  return byFile;
}

/**
 * Restrict a file's client-derived severity map to the lines the SERVER
 * flagged. `finding_lines` is authoritative — a marker must never appear on a
 * line outside it. A flagged line the client cannot colour simply gets no
 * marker.
 */
export function severityForFlaggedLines(
  severityByLine: ReadonlyMap<number, Severity> | undefined,
  findingLines: readonly number[],
): Map<number, Severity> {
  const flagged = new Map<number, Severity>();
  if (!severityByLine) return flagged;
  for (const line of findingLines) {
    const severity = severityByLine.get(line);
    if (severity) flagged.set(line, severity);
  }
  return flagged;
}

/**
 * `path -> every latest-per-agent finding on that file`, INCLUDING dismissed
 * ones — `partitionFileFindings` needs the full list to still render a
 * dismissed finding as a muted card (Decision 6).
 */
export function findingsByFile(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const byFile = new Map<string, FindingRecord[]>();
  for (const finding of latestFindingsPerAgent(reviews)) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }
  return byFile;
}

/**
 * Split one file's findings into inline (keyed by `lineKey("RIGHT",
 * start_line)`) and off-patch buckets:
 *   - inline iff the key is rendered in the current patch AND (`start_line` is
 *     in the server's `finding_lines` OR the finding is dismissed — a
 *     dismissed finding is excluded from `finding_lines` by construction, so
 *     it would otherwise never qualify);
 *   - off-patch iff the key is NOT rendered (a `null` patch renders no keys,
 *     so every finding on that file is off-patch);
 *   - a NON-dismissed finding with a rendered key that is missing from
 *     `finding_lines` is transient query skew (the two fetches raced) and is
 *     shown nowhere — showing it would draw a card with no line marker.
 */
export function partitionFileFindings(
  findings: readonly FindingRecord[],
  renderedKeys: ReadonlySet<string>,
  findingLines: readonly number[],
): { inlineByKey: Map<string, FindingRecord[]>; offPatch: FindingRecord[] } {
  const inScope = new Set(findingLines);
  const inlineByKey = new Map<string, FindingRecord[]>();
  const offPatch: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (!key || !renderedKeys.has(key)) {
      offPatch.push(f);
      continue;
    }
    if (inScope.has(f.start_line) || f.dismissed_at) {
      const list = inlineByKey.get(key) ?? [];
      list.push(f);
      inlineByKey.set(key, list);
    }
  }
  return { inlineByKey, offPatch };
}

/** Files in a group with at least one (non-dismissed, in-scope) finding —
 *  the group header's `● N` count (Decision 6: dot/counter agree by
 *  construction because both read `finding_lines.length`). */
export function filesWithFindings(files: readonly SmartDiffFile[]): number {
  return files.filter((f) => f.finding_lines.length > 0).length;
}

/** Whether a `kind === "review"` review has run for this PR (Decision 9) —
 *  drives the "review not run yet" empty state in a group header. A
 *  `"summary"` row alone doesn't count: it carries no findings. */
export function hasReviewRun(reviews: ReviewRecord[] | undefined): boolean {
  return (reviews ?? []).some((r) => r.kind === "review");
}
