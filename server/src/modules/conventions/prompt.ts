import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';
import { MAX_CANDIDATES } from './constants.js';

/**
 * The one extraction call: messages + the structured-output schema. Field
 * order is deliberate: the model writes the rule and its evidence first and
 * decides category and confidence LAST, after it has looked at the code (with
 * category first it put almost everything in one bucket).
 */
export const ExtractionSchema = z.object({
  candidates: z
    .array(
      z.object({
        rule: z.string().describe('The convention as a directive, e.g. "Use async/await, not .then() chains".'),
        rationale: z.string().nullable().describe('Why the codebase does this, in one sentence; null if unclear.'),
        evidence_path: z.string().describe('Path of a sampled file that follows the rule, exactly as given.'),
        evidence_line: z.number().int().describe('Line number (from the gutter) where the evidence starts.'),
        evidence_snippet: z
          .string()
          .describe('1-6 lines copied VERBATIM from that file (without the line-number gutter).'),
        pattern: z
          .string()
          .nullable()
          .describe('A ripgrep regex that finds other code following the rule; null if none is precise.'),
        category: ConventionCategory,
        confidence: z.number().min(0).max(1).describe('How sure you are this is a deliberate, repo-wide rule.'),
      }),
    )
    .max(MAX_CANDIDATES),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

const SYSTEM = `You extract HOUSE CONVENTIONS from a code repository: rules this codebase follows consistently that a new contributor would get wrong, and that a code reviewer could check.

Good conventions are specific to this repo: naming, file/module structure, error handling, testing style, import style, typing, API shape. Skip generic best practices ("write clean code", "use TypeScript") and anything a formatter enforces by itself.

Every convention MUST cite evidence: a sampled file path and 1-6 lines copied verbatim from it (no line-number gutter). Claims without real evidence are discarded. Prefer fewer, well-evidenced rules over many weak ones.`;

export function buildMessages(repoName: string, sample: string) {
  return [
    { role: 'system' as const, content: SYSTEM },
    {
      role: 'user' as const,
      content: `Repository: ${repoName}\n\nSampled files (each line prefixed with its number):\n\n${sample}\n\nReturn up to ${MAX_CANDIDATES} conventions.`,
    },
  ];
}
