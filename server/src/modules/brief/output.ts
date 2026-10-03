import { z } from 'zod';
import { RiskSeverity } from '@devdigest/shared';

/**
 * The structured-output schema of the brief's ONE model call. Lives apart from
 * `prompt.ts` so `ports.ts` and `helpers.ts` can type against it without an
 * import cycle through the prompt builder.
 */

// The model-facing line fields are `.nullable()` (not `.optional()`): OpenAI
// strict structured outputs require every property, and the shared contract's
// optional `start_line` / `end_line` would otherwise be forced to a number.
// `helpers.ts#validateBrief` maps null / invalid lines to "no line".
const ModelFileRef = z.object({
  file: z.string().describe('Repo-relative path of a file listed in the facts.'),
  start_line: z.number().int().nullable().describe('First line of interest, or null when unknown.'),
  end_line: z.number().int().nullable().describe('Last line of interest, or null.'),
});

const ModelRisk = z.object({
  kind: z.string().describe('Short free-text category, e.g. "auth surface" or "data migration".'),
  title: z.string().describe('One short line naming the risk.'),
  explanation: z.string().describe('One or two sentences on why it is risky.'),
  severity: RiskSeverity,
  file_refs: z.array(ModelFileRef).describe('Files this risk concerns; each must be listed in the facts.'),
});

const ModelFocusItem = z.object({
  file: z.string().describe('Repo-relative path of a file listed in the facts.'),
  line: z.number().int().describe('The line a reviewer should read first.'),
  reason: z.string().describe('One short sentence: why read it first.'),
});

const ModelFileSummary = z.object({
  file: z.string().describe('Repo-relative path of a CHANGED file from the changed-file list.'),
  summary: z.string().describe('One short sentence: what the change in this file does, from the facts only.'),
});

export const BriefModelOutput = z.object({
  summary: z.string().describe('Two or three sentences: what this PR does and what to watch for.'),
  risks: z.array(ModelRisk).describe('At most 8 risks, most important first.'),
  review_focus: z.array(ModelFocusItem).describe('At most 10 places to read first, most important first.'),
  file_summaries: z
    .array(ModelFileSummary)
    .describe('One entry per core or wiring file in the changed-file list, at most 40.'),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

export const BRIEF_SCHEMA_NAME = 'PrBrief';
