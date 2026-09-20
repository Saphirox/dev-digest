import type { Finding, PrIntentRecord } from '@devdigest/shared';

/**
 * Scope filter (Intent Layer). Deterministic, no LLM: a finding is
 * OUT-OF-SCOPE when the tokens of an `intent.out_of_scope` entry match
 * `finding.file` or `finding.title` (everything lowercased, split on
 * non-alphanumeric runs, tokens shorter than 3 chars dropped).
 *
 * The matching rule is deliberately asymmetric, because a single shared word
 * is far too weak a signal to delete a real finding on:
 *   - STOPWORDS are stripped from the scope entry first. Without this, the
 *     entry "Logging / observability FOR the limiter" contributes `for`, and
 *     every finding whose title contains "for" is classified out-of-scope.
 *   - A PATH-SEGMENT hit counts on its own (a path is specific).
 *   - A TITLE hit needs `min(2, tokens.length)` distinct tokens from the SAME
 *     entry, so "Authentication changes" no longer matches an unrelated title
 *     that merely says "changes", while a single-token entry such as
 *     "authentication" still matches on its own.
 * Under-matching is the safe direction here: a missed drop is noise, a wrong
 * drop is a hidden defect.
 *
 * Two invariants, tested first:
 *   - CRITICAL findings are NEVER dropped, in or out of scope.
 *   - Out-of-scope findings are never silently discarded in bulk: exactly ONE
 *     survives as the "carrier" (highest severity, tie-broken by highest
 *     confidence, then original order), keeping its real `file`/`start_line`/
 *     `end_line`/`severity`/`category`/`confidence` untouched (so it stays
 *     grounded against the diff) — only `title`/`rationale` are rewritten to
 *     name the other N findings it stands in for. The rest are dropped.
 *
 * No intent, or an intent with an empty `out_of_scope`, is the identity
 * transform.
 */

export interface ScopeFilterResult {
  /** In-scope + CRITICAL findings, plus the one carrier (rewritten). */
  kept: Finding[];
  /** Out-of-scope findings collapsed onto the carrier. */
  dropped: Finding[];
  /** The finding chosen to carry the "N more out-of-scope" signal, or `null`
   *  when nothing was filtered. */
  carrier: Finding | null;
}

const MIN_TOKEN_LEN = 3;

/**
 * Generic words that carry no scope signal. A scope entry is a short English
 * phrase, so without this list its filler words ("for", "the", "new", …)
 * match unrelated finding titles and drop real defects.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'not', 'any', 'all', 'its', 'out', 'via', 'per', 'are',
  'was', 'has', 'had', 'can', 'may', 'use', 'get', 'set', 'add', 'new', 'old',
  'this', 'that', 'with', 'from', 'into', 'when', 'then', 'than', 'more',
  'less', 'also', 'only', 'some', 'such', 'must', 'should', 'would', 'could',
  'change', 'changes', 'changed', 'update', 'updates', 'updated', 'support',
  'handling', 'related', 'other', 'others', 'stuff', 'things', 'work',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

function pathSegments(file: string): Set<string> {
  return new Set(
    file
      .toLowerCase()
      .split(/[\\/]/)
      .flatMap((seg) => seg.split(/[^a-z0-9]+/))
      .filter((s) => s.length >= MIN_TOKEN_LEN),
  );
}

/** An out-of-scope entry reduced to the tokens that actually carry meaning. */
function scopeTokens(entry: string): string[] {
  return [...new Set(tokenize(entry).filter((t) => !STOPWORDS.has(t)))];
}

function isOutOfScope(finding: Finding, outOfScope: string[]): boolean {
  const fileSegs = pathSegments(finding.file);
  const titleWords = new Set(tokenize(finding.title));
  return outOfScope.some((entry) => {
    const tokens = scopeTokens(entry);
    // An entry made entirely of stopwords carries no signal at all.
    if (tokens.length === 0) return false;
    if (tokens.some((tok) => fileSegs.has(tok))) return true;
    const titleHits = tokens.filter((tok) => titleWords.has(tok)).length;
    return titleHits >= Math.min(2, tokens.length);
  });
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

function rewriteCarrierTitle(title: string, otherCount: number): string {
  if (otherCount === 0) return title;
  return `${title} (+${otherCount} more out-of-scope finding${otherCount === 1 ? '' : 's'})`;
}

function rewriteCarrierRationale(rationale: string, others: Finding[]): string {
  if (others.length === 0) return rationale;
  const names = others.map((o) => `"${o.title}" (${o.file})`).join(', ');
  return `${rationale}\n\nAlso flagged as out-of-scope but collapsed here to avoid noise: ${names}.`;
}

export function filterOutOfScope(
  findings: Finding[],
  intent: PrIntentRecord | null | undefined,
): ScopeFilterResult {
  if (!intent || intent.out_of_scope.length === 0) {
    return { kept: findings, dropped: [], carrier: null };
  }

  const keep: Finding[] = [];
  const outOfScopeCandidates: Finding[] = [];
  for (const f of findings) {
    if (f.severity === 'CRITICAL' || !isOutOfScope(f, intent.out_of_scope)) {
      keep.push(f);
    } else {
      outOfScopeCandidates.push(f);
    }
  }

  if (outOfScopeCandidates.length === 0) {
    return { kept: findings, dropped: [], carrier: null };
  }

  // Highest severity, tie-broken by highest confidence, then original order
  // (index-stable — Array.prototype.sort is stable per spec, but the index
  // compare makes the rule explicit regardless).
  const ranked = outOfScopeCandidates
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const sevDiff = SEVERITY_RANK[b.f.severity] - SEVERITY_RANK[a.f.severity];
      if (sevDiff !== 0) return sevDiff;
      const confDiff = b.f.confidence - a.f.confidence;
      if (confDiff !== 0) return confDiff;
      return a.i - b.i;
    });

  const chosen = ranked[0]!.f;
  const rest = outOfScopeCandidates.filter((f) => f !== chosen);

  const carrier: Finding = {
    ...chosen,
    title: rewriteCarrierTitle(chosen.title, rest.length),
    rationale: rewriteCarrierRationale(chosen.rationale, rest),
  };

  // Preserve the original relative order: walk `findings` once, keeping the
  // kept ones (unchanged) and substituting the carrier for the chosen one.
  const keepSet = new Set(keep);
  const kept = findings
    .filter((f) => keepSet.has(f) || f === chosen)
    .map((f) => (f === chosen ? carrier : f));

  return { kept, dropped: rest, carrier };
}
