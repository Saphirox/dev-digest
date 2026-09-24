/** Pure helpers for the SmartDiffViewer (no React). */
import type { ReviewRecord, Severity } from "@devdigest/shared";
import { SEVERITIES, countBySeverity } from "@/lib/severity";

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
 * The findings that count for a PR, mirroring the server's
 * `latestFindingRangesForPull`: only `kind === "review"` rows count, and only
 * the NEWEST review per `agent_id` — a `null` agent id (the seeded demo review
 * has none) collapses every agent-less review into one group.
 *
 * Every consumer below goes through this one function so the badge count and
 * the severity colours can never disagree about *which* review they describe.
 */
function latestFindingsPerAgent(reviews: ReviewRecord[]) {
  const latestByAgent = new Map<string | null, ReviewRecord>();
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const current = latestByAgent.get(review.agent_id);
    if (!current || review.created_at > current.created_at) {
      latestByAgent.set(review.agent_id, review);
    }
  }
  return [...latestByAgent.values()].flatMap((review) => review.findings);
}

/**
 * Build a `path -> (new-side line -> worst severity)` map. On a shared line the
 * worse severity wins. This is *colour only* — the set of flagged lines comes
 * from the server's `finding_lines`, never from here (see
 * `severityForFlaggedLines`).
 */
export function buildSeverityByFile(reviews: ReviewRecord[]): Map<string, Map<number, Severity>> {
  const byFile = new Map<string, Map<number, Severity>>();
  for (const finding of latestFindingsPerAgent(reviews)) {
    const end = Math.max(finding.start_line, finding.end_line);
    const byLine = byFile.get(finding.file) ?? new Map<number, Severity>();
    for (let line = finding.start_line; line <= end; line++) {
      const existing = byLine.get(line);
      byLine.set(line, existing ? worseOf(existing, finding.severity) : finding.severity);
    }
    byFile.set(finding.file, byLine);
  }
  return byFile;
}

/**
 * `path -> counts per severity` — one dot-with-count per present severity on
 * the file header. Deliberately NOT `finding_lines.length`: one finding
 * spanning `start_line..end_line` flags many lines, so counting lines would
 * report "22 findings" for what is really three. Severity accounting itself
 * is delegated to `countBySeverity` (`@/lib/severity`) so it lives in one
 * place across the app.
 */
export function countFindingsBySeverityByFile(
  reviews: ReviewRecord[],
): Map<string, Record<Severity, number>> {
  const byFile = new Map<string, ReviewRecord["findings"]>();
  for (const finding of latestFindingsPerAgent(reviews)) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }
  const counts = new Map<string, Record<Severity, number>>();
  for (const [file, findings] of byFile) {
    counts.set(file, countBySeverity(findings));
  }
  return counts;
}

/**
 * The lowest line in `markers` (the output of `severityForFlaggedLines`)
 * carrying the given severity, or `null` if that severity has no coloured
 * flagged line. Takes the *markers* map, never the raw per-file severity map,
 * so a click can never target a line outside the server's authoritative
 * `finding_lines`.
 */
export function firstLineOfSeverity(
  markers: ReadonlyMap<number, Severity>,
  severity: Severity,
): number | null {
  let best: number | null = null;
  for (const [line, sev] of markers) {
    if (sev === severity && (best === null || line < best)) best = line;
  }
  return best;
}

/**
 * Build a `path -> (new-side line -> finding id)` map, mirroring
 * `buildSeverityByFile`'s worst-severity-wins tie-break EXACTLY (same
 * `latestFindingsPerAgent` funnel, same `worseOf` comparison, same
 * equal-severity "first wins" behaviour) so the badge's link target can never
 * name a different finding than the one its colour shows. Only the id is
 * returned — every line that gets a marker in `buildSeverityByFile` has an
 * entry here, and vice versa.
 */
export function buildFindingIdByLine(reviews: ReviewRecord[]): Map<string, Map<number, string>> {
  const byFile = new Map<string, Map<number, { severity: Severity; id: string }>>();
  for (const finding of latestFindingsPerAgent(reviews)) {
    const end = Math.max(finding.start_line, finding.end_line);
    const byLine = byFile.get(finding.file) ?? new Map<number, { severity: Severity; id: string }>();
    for (let line = finding.start_line; line <= end; line++) {
      const existing = byLine.get(line);
      // Overwrite only when strictly worse, so an equal-severity tie keeps
      // the FIRST finding — exactly what `worseOf` does for `buildSeverityByFile`
      // (`rank(a) <= rank(b)` favours the already-mapped `a` on a tie).
      if (!existing) {
        byLine.set(line, { severity: finding.severity, id: finding.id });
      } else if (worseOf(existing.severity, finding.severity) === finding.severity && finding.severity !== existing.severity) {
        byLine.set(line, { severity: finding.severity, id: finding.id });
      }
    }
    byFile.set(finding.file, byLine);
  }
  const ids = new Map<string, Map<number, string>>();
  for (const [file, byLine] of byFile) {
    const lineToId = new Map<number, string>();
    for (const [line, { id }] of byLine) lineToId.set(line, id);
    ids.set(file, lineToId);
  }
  return ids;
}

/**
 * Restrict a file's client-derived severity map to the lines the SERVER
 * flagged. `finding_lines` is authoritative — it is already capped at
 * `MAX_FINDING_RANGE_LINES` server-side and is what the badge's click target
 * cycles through — so a marker must never appear on a line outside it. A
 * flagged line the client cannot colour simply gets no marker.
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
