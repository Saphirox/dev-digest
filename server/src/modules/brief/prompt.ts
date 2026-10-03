import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import type { BriefFacts } from './helpers.js';

export { BriefModelOutput, BRIEF_SCHEMA_NAME } from './output.js';

/**
 * The brief's ONE call: messages. The model is given facts only — file paths,
 * add/delete counts, Smart Diff roles, the blast map's names, intent, issue,
 * spec documents — NEVER diff body lines. `helpers.ts#buildFacts` enforces
 * that; this file just wraps its output. The output schema is in `output.ts`.
 */

const SYSTEM = `You write a PR Brief for a code reviewer: a short summary, the risks of this change, and where to start reading. You are given FACTS about the pull request — its description, a linked issue, a derived intent, the blast-radius map, changed-file statistics and attached spec documents. You are NOT given the code or any diff: never claim to have read it, and reason only from the facts.

Rules:
- Line numbers: for a changed file, cite a line inside one of its listed line ranges (prefer the start of the most relevant range); never use 1 as a placeholder. For a blast-radius-only file, use a caller line from the blast map.
- Every risk and every review-focus item must cite a file that appears in the changed-file list or the blast-radius map; use the path exactly as written there. Do not invent files or line numbers you cannot ground; use null for an unknown line range.
- Return at most 8 risks and at most 10 review-focus items, most important first. Fewer is better than padding.
- For file_summaries, write one short sentence per changed file that does real work (skip lockfiles and generated files), saying what the change in that file does. Base it only on the path, its role and the changed symbols listed for it in the blast-radius map; if those say too little, describe the file's role in this PR instead of guessing at code. Only use paths from the changed-file list.
- If a section is listed under "Missing inputs", you could not read it — say less rather than guess.

${INJECTION_GUARD}`;

/** The one user message: untrusted facts wrapped, plain stats and missing inputs. */
export function buildBriefMessages(facts: BriefFacts): ChatMessage[] {
  const sections: string[] = [];

  sections.push(`## PR\n${wrapUntrusted('pr-title-body', facts.prText)}`);
  if (facts.issueText) sections.push(`## Linked issue\n${wrapUntrusted('linked-issue', facts.issueText)}`);
  if (facts.intentText) sections.push(`## Intent\n${wrapUntrusted('intent', facts.intentText)}`);
  if (facts.blastText) sections.push(`## Blast radius\n${wrapUntrusted('blast-radius', facts.blastText)}`);
  for (const doc of facts.specs) {
    sections.push(`## Spec document\n${wrapUntrusted(`spec:${doc.path}`, doc.content)}`);
  }

  const listing =
    facts.fileListed < facts.fileTotal ? `${facts.fileListed} of ${facts.fileTotal} listed` : `${facts.fileTotal}`;
  sections.push(
    `## Changed files\nFiles changed: ${listing}; total +${facts.additions} -${facts.deletions}. Each line: path, +added, -deleted, role, and the new-side line ranges the change touches.\n${wrapUntrusted('file-list', facts.filesText)}`,
  );

  if (facts.missing.length > 0) {
    sections.push(`## Missing inputs\n${facts.missing.map((m) => `- ${m}`).join('\n')}`);
  }

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: sections.join('\n\n') },
  ];
}
