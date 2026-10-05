/**
 * Pure helpers for the PR Brief (no I/O imports — no DB, GitHub, or
 * container). Every function here operates only on its arguments.
 */
import type { BlastRadius, FileSummary, ReviewFocusItem, Risk, RiskFileRef } from '@devdigest/shared';
import { classifyFile } from '../reviews/smart-diff/index.js';
import {
  FRAME_RESERVE_CHARS,
  MAX_BLAST_CHARS,
  MAX_BODY_CHARS,
  MAX_FACT_CHARS,
  MAX_FILES,
  MAX_FOCUS,
  MAX_FILE_SUMMARIES,
  MAX_FILE_SUMMARY_CHARS,
  MAX_INTENT_CHARS,
  MAX_ISSUE_CHARS,
  MAX_RISKS,
  SPEC_WRAPPER_CHARS,
  TRUNCATION_MARKER,
} from './constants.js';
import type { BriefFile, BriefIntent, LineRange } from './ports.js';
import type { BriefModelOutput } from './output.js';

// ---------------------------------------------------------------------------
// Path matching (AC-5, AC-6, EC-8)
// ---------------------------------------------------------------------------

/** Strip ONE leading `./`; otherwise the path is compared exactly (EC-8). */
/** Matches a unified-diff hunk header and captures its new-side start/count. */
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
/** Ranges listed per file in the facts; the rest still validate lines. */
const MAX_RANGES_LISTED = 8;

/**
 * New-side line ranges of a patch's hunks, from the `@@` headers only — the
 * diff body is never inspected. A pure deletion (`+n,0`) contributes `n..n`.
 */
export function hunkRanges(patch: string | null | undefined): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Math.max(1, Number(m[1]));
    const count = m[2] === undefined ? 1 : Number(m[2]);
    ranges.push({ start, end: start + Math.max(count, 1) - 1 });
  }
  return ranges;
}

function inRanges(line: number, ranges: readonly LineRange[]): boolean {
  return ranges.some((r) => line >= r.start && line <= r.end);
}

export function normalizePath(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path;
}

/** Every file the blast map names: changed-symbol files, downstream symbol files, caller files. */
export function blastFiles(blast: BlastRadius | null): string[] {
  if (!blast) return [];
  const files = new Set<string>();
  for (const s of blast.changed_symbols) files.add(s.file);
  for (const d of blast.downstream) {
    if (d.file) files.add(d.file);
    for (const c of d.callers) files.add(c.file);
  }
  return [...files];
}

/** The set of files a risk / focus item may cite: the PR's files plus the blast map's. */
export function knownFiles(prFiles: { path: string }[], blast: BlastRadius | null): Set<string> {
  return new Set([...prFiles.map((f) => f.path), ...blastFiles(blast)]);
}

// ---------------------------------------------------------------------------
// Spec document paths (D-7)
// ---------------------------------------------------------------------------

/**
 * The document paths a brief reads: every enabled agent's own paths, plus the
 * paths of each of those agents' enabled skills (`perAgentSkills[i]` belongs to
 * `agents[i]`, one list per skill). Order is kept; dropping repeated paths and
 * the size caps are Project Context's job when it reads them.
 */
export function collectSpecPaths(
  agents: readonly { contextPaths: readonly string[] }[],
  perAgentSkills: readonly (readonly (readonly string[])[])[],
): { agentPaths: string[]; skillPaths: string[][] } {
  return {
    agentPaths: agents.flatMap((a) => [...a.contextPaths]),
    skillPaths: perAgentSkills.flatMap((skills) => skills.map((paths) => [...paths])),
  };
}

// ---------------------------------------------------------------------------
// validateBrief (AC-5, AC-6, AC-26, EC-8, NFR-6)
// ---------------------------------------------------------------------------

function validLine(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

export interface ValidatedBrief {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  file_summaries: FileSummary[];
}

/**
 * Ground the model's output in known files: drop the unknown refs of a risk
 * (the risk itself only when none is left), drop focus items on unknown files
 * or without a valid line, store the normalized path, then keep the first
 * `MAX_RISKS` / `MAX_FOCUS` in the model's order.
 */
export function validateBrief(
  output: BriefModelOutput,
  known: ReadonlySet<string>,
  /** PR files → the new-side line ranges their hunks touch. Lines on a PR
   *  file must fall inside them (the model never sees code, so a line outside
   *  is a guess); omitted → every known file counts and lines aren't checked. */
  prLines?: ReadonlyMap<string, readonly LineRange[]>,
): ValidatedBrief {
  const prFiles: ReadonlySet<string> = prLines ? new Set(prLines.keys()) : known;
  const rangesOf = (file: string): readonly LineRange[] => prLines?.get(file) ?? [];

  const risks: Risk[] = [];
  for (const r of output.risks) {
    const refs: RiskFileRef[] = [];
    for (const ref of r.file_refs) {
      const file = normalizePath(ref.file);
      if (!known.has(file)) continue;
      const ranges = rangesOf(file);
      const grounded = (n: number) => ranges.length === 0 || inRanges(n, ranges);
      const start = validLine(ref.start_line) && grounded(ref.start_line) ? ref.start_line : undefined;
      const end =
        start !== undefined && validLine(ref.end_line) && ref.end_line >= start ? ref.end_line : undefined;
      refs.push({
        file,
        ...(start !== undefined ? { start_line: start } : {}),
        ...(end !== undefined ? { end_line: end } : {}),
      });
    }
    if (refs.length === 0) continue;
    risks.push({
      kind: r.kind,
      title: r.title,
      explanation: r.explanation,
      severity: r.severity,
      file_refs: refs,
    });
  }

  // A focus line outside the file's changed ranges (typically a placeholder
  // `1`) is snapped to the start of the file's first changed range.
  const focus: ReviewFocusItem[] = [];
  for (const f of output.review_focus) {
    const file = normalizePath(f.file);
    if (!known.has(file)) continue;
    const ranges = rangesOf(file);
    const line =
      validLine(f.line) && (ranges.length === 0 || inRanges(f.line, ranges))
        ? f.line
        : ranges[0]?.start;
    if (line === undefined) continue;
    focus.push({ file, line, reason: f.reason });
  }

  // File summaries only for files changed in the PR (they render on Files
  // changed), one per file, first one wins; empty text is dropped.
  const summaries: FileSummary[] = [];
  const summarized = new Set<string>();
  for (const f of output.file_summaries ?? []) {
    const file = normalizePath(f.file);
    const summary = f.summary.trim();
    if (!prFiles.has(file) || summarized.has(file) || summary === '') continue;
    summarized.add(file);
    summaries.push({ file, summary: truncateText(summary, MAX_FILE_SUMMARY_CHARS) });
  }

  return {
    summary: output.summary,
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS),
    file_summaries: summaries.slice(0, MAX_FILE_SUMMARIES),
  };
}

// ---------------------------------------------------------------------------
// missingInputs (AC-20, EC-1, EC-10)
// ---------------------------------------------------------------------------

/**
 * Fixed labels of the inputs that were unavailable: `intent`,
 * `blast radius (<reason>)` and `issue #<n>`, in that order. A blast radius
 * counts as missing when it could not be read, or is degraded with no changed
 * symbols (an unindexed repo).
 */
export function missingInputs(input: {
  intent: BriefIntent | null;
  blast: BlastRadius | null;
  /** The issue number the PR references, or null when it references none. */
  issueRef: number | null;
  /** Whether that issue was fetched. */
  issueFetched: boolean;
}): string[] {
  const out: string[] = [];
  if (!input.intent) out.push('intent');
  if (!input.blast) {
    out.push('blast radius (unavailable)');
  } else if (input.blast.degraded && input.blast.changed_symbols.length === 0) {
    out.push(`blast radius (${input.blast.reason ?? 'unavailable'})`);
  }
  if (input.issueRef !== null && !input.issueFetched) out.push(`issue #${input.issueRef}`);
  return out;
}

// ---------------------------------------------------------------------------
// buildFacts (AC-4, NFR-1, NFR-5)
// ---------------------------------------------------------------------------

export interface FactsInput {
  title: string;
  body: string | null;
  intent: BriefIntent | null;
  blast: BlastRadius | null;
  files: BriefFile[];
  issue: { number: number; title: string; body: string | null } | null;
  specs: { path: string; content: string }[];
  missing: string[];
}

/** The facts the prompt is built from, already cut to the budget. */
export interface BriefFacts {
  /** PR title + description. Untrusted. */
  prText: string;
  /** Linked issue. Untrusted. */
  issueText: string | null;
  /** Stored intent (derived by a model from untrusted text). */
  intentText: string | null;
  /** Blast-map names and paths. Untrusted. */
  blastText: string | null;
  /** `path +A -D role` lines, in the order given. Untrusted (repo paths). */
  filesText: string;
  /** Spec documents that fit the budget. Untrusted. */
  specs: { path: string; content: string }[];
  /** Labels of unavailable inputs (plain section). */
  missing: string[];
  /** Total changed files, and how many of them `filesText` lists. */
  fileTotal: number;
  fileListed: number;
  additions: number;
  deletions: number;
}

/** Cut `text` to at most `max` chars, ending with the truncation marker. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= TRUNCATION_MARKER.length) return text.slice(0, Math.max(0, max));
  return text.slice(0, max - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

/** Characters the facts occupy (what the budget is measured on). */
export function factsLength(f: BriefFacts): number {
  return (
    f.prText.length +
    (f.issueText?.length ?? 0) +
    (f.intentText?.length ?? 0) +
    (f.blastText?.length ?? 0) +
    f.filesText.length +
    f.specs.reduce((n, s) => n + s.content.length + specOverhead(s.path), 0) +
    f.missing.reduce((n, m) => n + m.length, 0)
  );
}

/** Worst-case wrapper cost of one spec block (the label is attribute-escaped, up to 6x). */
function specOverhead(path: string): number {
  return SPEC_WRAPPER_CHARS + path.length * 6;
}

function renderIntent(intent: BriefIntent): string {
  const lines = [`Summary: ${intent.intent}`];
  if (intent.inScope.length > 0) lines.push(`In scope: ${intent.inScope.join('; ')}`);
  if (intent.outOfScope.length > 0) lines.push(`Out of scope: ${intent.outOfScope.join('; ')}`);
  return lines.join('\n');
}

function renderBlast(blast: BlastRadius): string {
  const lines: string[] = [];
  if (blast.summary) lines.push(`Summary: ${blast.summary}`);
  if (blast.changed_symbols.length > 0) {
    lines.push('Changed symbols:');
    for (const s of blast.changed_symbols) lines.push(`- ${s.name} (${s.kind}) in ${s.file}`);
  }
  const withCallers = blast.downstream.filter((d) => d.callers.length > 0);
  if (withCallers.length > 0) {
    lines.push('Callers of changed symbols:');
    for (const d of withCallers) {
      lines.push(`- ${d.symbol}${d.file ? ` (${d.file})` : ''} is called from:`);
      for (const c of d.callers) lines.push(`  - ${c.name} in ${c.file}:${c.line}`);
    }
  }
  return lines.join('\n');
}

/**
 * Assemble the facts for ONE model call within `MAX_FACT_CHARS` (the prompt
 * frame is reserved out of it). Sections are kept in priority order — PR text,
 * intent, issue, blast, missing inputs, file list, spec documents — so when the
 * budget is tight the spec documents are cut first, then the file-list tail.
 * Never reads diff bodies: files carry only path, counts and Smart Diff role.
 */
export function buildFacts(input: FactsInput): BriefFacts {
  const budget = MAX_FACT_CHARS - FRAME_RESERVE_CHARS;

  const prText = `Title: ${input.title}\n\n${truncateText(input.body ?? '(no description)', MAX_BODY_CHARS)}`;
  const issueText = input.issue
    ? truncateText(
        `#${input.issue.number} ${input.issue.title}\n\n${input.issue.body ?? '(no description)'}`,
        MAX_ISSUE_CHARS,
      )
    : null;
  const intentText = input.intent ? truncateText(renderIntent(input.intent), MAX_INTENT_CHARS) : null;
  const blastRendered = input.blast ? renderBlast(input.blast) : '';
  const blastText = blastRendered ? truncateText(blastRendered, MAX_BLAST_CHARS) : null;
  const missingChars = input.missing.reduce((n, m) => n + m.length, 0);

  const fixed =
    prText.length + (issueText?.length ?? 0) + (intentText?.length ?? 0) + (blastText?.length ?? 0) + missingChars;

  // File list: keep whole lines, cut the tail when it would not fit.
  const lines = input.files.slice(0, MAX_FILES).map((f) => {
    const ranges = f.changedLines ?? [];
    const listed = ranges
      .slice(0, MAX_RANGES_LISTED)
      .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`));
    const more = ranges.length > MAX_RANGES_LISTED ? ',…' : '';
    const at = listed.length > 0 ? ` lines ${listed.join(',')}${more}` : '';
    return `${f.path} +${f.additions} -${f.deletions} ${classifyFile(f.path)}${at}`;
  });
  const fileBudget = Math.max(0, budget - fixed);
  const listed: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.length + (listed.length > 0 ? 1 : 0);
    if (used + cost > fileBudget) break;
    listed.push(line);
    used += cost;
  }
  let filesText = listed.join('\n');
  if (listed.length < input.files.length) filesText += `${filesText ? '\n' : ''}${TRUNCATION_MARKER}`;

  // Spec documents get whatever is left, in order; the last one may be cut.
  let remaining = budget - fixed - filesText.length;
  const specs: { path: string; content: string }[] = [];
  for (const doc of input.specs) {
    const room = remaining - specOverhead(doc.path);
    if (room <= TRUNCATION_MARKER.length) break;
    const content = truncateText(doc.content, room);
    specs.push({ path: doc.path, content });
    remaining -= content.length + specOverhead(doc.path);
  }

  return {
    prText,
    issueText,
    intentText,
    blastText,
    filesText,
    specs,
    missing: input.missing,
    fileTotal: input.files.length,
    fileListed: listed.length,
    additions: input.files.reduce((n, f) => n + f.additions, 0),
    deletions: input.files.reduce((n, f) => n + f.deletions, 0),
  };
}
