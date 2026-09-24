import { z } from 'zod';
import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';

/**
 * The intent classifier's ONE call: messages + structured-output schema. The
 * model is given file paths, add/delete counts and `@@ … @@` hunk headers
 * only — NEVER diff body (`+`/`-`/context) lines. See `helpers.ts#hunkHeaders`
 * for the re-scan that enforces this on the server side; this file just
 * assumes its input is already header-only.
 */

export const IntentSchema = z.object({
  summary: z.string().describe("One or two sentences: what this PR does and why."),
  in_scope: z.array(z.string()).describe('Areas/behaviors this PR is expected to touch.'),
  out_of_scope: z.array(z.string()).describe('Areas/behaviors this PR explicitly does NOT touch.'),
  missing_context: z
    .array(z.string())
    .describe(
      'Referenced documents or issues you could not read (echo the refs listed under "Missing context" plus any you infer); never invent their contents.',
    ),
});
export type IntentClassification = z.infer<typeof IntentSchema>;

export const INTENT_SCHEMA_NAME = 'PrIntent';

const SYSTEM = `You classify a pull request's INTENT and SCOPE from limited evidence: its title/description, a linked issue if any, linked repo documents if readable, and its changed-file list with \`@@ … @@\` hunk headers ONLY — diff bodies are deliberately excluded from what you are given. Never claim to have read the code; reason only from file names, hunk locations, and the text provided.

Write a short summary of what the PR does and why, a list of areas/behaviors it is IN scope for, and a list it is explicitly OUT of scope for (aim for a few short, concrete phrases in each list, not prose). If a reference is listed under "## Missing context" below, you could not read it — echo it under \`missing_context\` in your answer. Never invent the contents of something you could not read.`;

export interface BuildMessagesIssue {
  number: number;
  title: string;
  body: string | null;
}

export interface BuildMessagesDoc {
  path: string;
  content: string;
}

export interface BuildMessagesFile {
  path: string;
  additions: number;
  deletions: number;
  /** `@@ … @@` header lines only — never a `+`/`-`/context diff line. */
  headers: string[];
}

export interface BuildMessagesInput {
  title: string;
  body: string | null;
  /** Linked issue, when `extractIssueRef` found one AND it was readable. */
  issue?: BuildMessagesIssue | null;
  /** Linked repo documents that WERE readable. */
  docs: BuildMessagesDoc[];
  /** Refs (issue, doc paths, external links) that could NOT be read. */
  missingRefs: string[];
  files: BuildMessagesFile[];
}

/** Render the `path (+A/-D)` + its hunk headers, one file per block. */
function renderFileList(files: BuildMessagesFile[]): string {
  return files
    .map((f) => {
      const headerLines =
        f.headers.length > 0 ? f.headers.map((h) => `  ${h}`).join('\n') : '  (no hunk headers)';
      return `${f.path} (+${f.additions}/-${f.deletions})\n${headerLines}`;
    })
    .join('\n');
}

export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const sections: string[] = [];

  const prText = `Title: ${input.title}\n\n${input.body ?? '(no description)'}`;
  sections.push(`## PR\n${wrapUntrusted('pr-title-body', prText)}`);

  if (input.issue) {
    const issueText = `#${input.issue.number} ${input.issue.title}\n\n${input.issue.body ?? '(no description)'}`;
    sections.push(`## Linked issue\n${wrapUntrusted('linked-issue', issueText)}`);
  }

  for (const doc of input.docs) {
    sections.push(`## Linked documents\n${wrapUntrusted(`repo-file:${doc.path}`, doc.content)}`);
  }

  if (input.missingRefs.length > 0) {
    sections.push(`## Missing context\n${input.missingRefs.map((r) => `- ${r}`).join('\n')}`);
  }

  sections.push(`## Changed files\n${wrapUntrusted('file-list', renderFileList(input.files))}`);

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: sections.join('\n\n') },
  ];
}
