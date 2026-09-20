import type { ConventionCandidate, ConventionSkillDraft } from '@devdigest/shared';
import {
  CONVENTIONS_SKILL_NAME,
  MAX_CHARS_PER_FILE,
  MAX_LINES_PER_FILE,
  MAX_PATTERN_LENGTH,
  MAX_SNIPPET_LINES,
  MAX_TOTAL_CHARS,
  MIN_SNIPPET_CHARS,
  SINGLE_FILE_PENALTY,
} from './constants.js';
import type { ConventionRecord } from './ports.js';

/**
 * Pure conventions logic: sample rendering, evidence verification, dedupe,
 * confidence adjustment, record → DTO, and the skill draft. No I/O.
 */

export interface SampleFile {
  path: string;
  content: string;
}

/**
 * Render sampled files for the prompt, each line prefixed with its 1-based
 * number so the model can cite `file:line`. Per-file and total caps; files
 * that don't fit are left out (and not listed as sampled).
 */
export function renderSample(files: SampleFile[]): { text: string; included: string[] } {
  const parts: string[] = [];
  const included: string[] = [];
  let total = 0;
  for (const f of files) {
    const lines = f.content.slice(0, MAX_CHARS_PER_FILE).split('\n').slice(0, MAX_LINES_PER_FILE);
    const width = String(lines.length).length;
    const body = lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`).join('\n');
    const block = `=== FILE: ${f.path} ===\n${body}\n`;
    if (total + block.length > MAX_TOTAL_CHARS) continue;
    parts.push(block);
    included.push(f.path);
    total += block.length;
  }
  return { text: parts.join('\n'), included };
}

/** The sampled path the model meant: exact, else the only sampled path ending with it. */
export function resolveSampledPath(claimed: string, sampled: string[]): string | null {
  const clean = claimed.trim().replace(/^\.?\//, '');
  if (sampled.includes(clean)) return clean;
  const hits = sampled.filter((p) => p.endsWith(`/${clean}`) || clean.endsWith(`/${p}`));
  return hits.length === 1 ? hits[0]! : null;
}

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * Find the model's snippet in the file, ignoring whitespace and case. With
 * several hits the one nearest the claimed line wins, so a wrong line number
 * is corrected rather than fatal. Returns the snippet RE-READ from the file.
 */
export function locateSnippet(
  content: string,
  snippet: string,
  claimedLine: number,
): { line: number; lineEnd: number; snippet: string } | null {
  const needle = squash(snippet);
  if (needle.length < MIN_SNIPPET_CHARS) return null;

  const lines = content.split('\n');
  // Squashed file text + the 1-based line of each squashed char.
  let hay = '';
  const lineOf: number[] = [];
  lines.forEach((l, i) => {
    const sq = squash(l);
    hay += sq;
    for (let k = 0; k < sq.length; k++) lineOf.push(i + 1);
  });

  let best: { line: number; lineEnd: number } | null = null;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
    const hit = { line: lineOf[at]!, lineEnd: lineOf[at + needle.length - 1]! };
    if (!best || Math.abs(hit.line - claimedLine) < Math.abs(best.line - claimedLine)) best = hit;
  }
  if (!best) return null;
  const lineEnd = Math.min(best.lineEnd, best.line + MAX_SNIPPET_LINES - 1);
  return { line: best.line, lineEnd, snippet: lines.slice(best.line - 1, lineEnd).join('\n') };
}

/** Rule text reduced to its words, for duplicate detection. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Frequency check: a rule whose pattern matches only one file is a one-off,
 * not a convention. Unknown counts leave the model's confidence as is.
 */
export function adjustConfidence(confidence: number, occurrences: number | null): number {
  const c = Math.min(1, Math.max(0, confidence));
  const adjusted = occurrences === 1 ? c * SINGLE_FILE_PENALTY : c;
  return Math.round(adjusted * 100) / 100;
}

export function toConventionDto(r: ConventionRecord): ConventionCandidate {
  const snippetLines = r.evidenceSnippet ? r.evidenceSnippet.split('\n').length : 0;
  return {
    id: r.id,
    rule: r.rule,
    category: r.category,
    rationale: r.rationale,
    evidence_path: r.evidencePath ?? '',
    evidence_snippet: r.evidenceSnippet ?? '',
    evidence_line: r.evidenceLine,
    evidence_line_end: r.evidenceLine != null && snippetLines > 0 ? r.evidenceLine + snippetLines - 1 : null,
    confidence: r.confidence ?? 0,
    occurrences: r.occurrences,
    status: r.status,
    created_at: r.createdAt.toISOString(),
  };
}

/** `Always use async/await` → `always-use-async-await` (skill section headings). */
export function slugify(text: string, max = 48): string {
  return normalizeRule(text).split(' ').join('-').slice(0, max).replace(/-+$/, '') || 'rule';
}

/**
 * Accepted conventions merged into one editable skill: a directive intro, then
 * one section per rule with the evidence it was detected from.
 */
export function buildSkillDraft(repoName: string, accepted: ConventionRecord[]): ConventionSkillDraft {
  const name = CONVENTIONS_SKILL_NAME;
  const sections = accepted.map((c) => {
    const where =
      c.evidencePath && c.evidenceLine != null ? `${c.evidencePath}:${c.evidenceLine}` : c.evidencePath;
    const evidence =
      where && c.evidenceSnippet ? `\n\nDetected in \`${where}\`:\n\n\`\`\`\n${c.evidenceSnippet}\n\`\`\`` : '';
    return `## ${slugify(c.rule)}\n${c.rule}${evidence}`;
  });
  const body = [
    `# ${name}`,
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join('\n\n');
  const n = accepted.length;
  return {
    name,
    description: `${n} house convention${n === 1 ? '' : 's'} extracted from ${repoName}`,
    type: 'convention',
    body,
    convention_count: n,
  };
}

/**
 * A model-written search pattern we are willing to run. It is untrusted (the
 * model read the scanned repo, so the repo can steer it): no leading `-` (would
 * be an option to ripgrep), within the length cap, a valid regex, and no nested
 * quantifier such as `(a+)+` or backreference, which can backtrack for ever in
 * the Node fallback. Anything else → null (frequency unknown).
 */
export function safeSearchPattern(raw: string | null | undefined): string | null {
  const pattern = raw?.trim();
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH || pattern.startsWith('-')) return null;
  if (/\([^)]*[+*}][^)]*\)\s*[+*{]/.test(pattern) || /\\[1-9]/.test(pattern)) return null;
  try {
    new RegExp(pattern);
  } catch {
    return null;
  }
  return pattern;
}
