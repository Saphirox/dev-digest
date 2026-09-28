/**
 * Flat, primitive input fields shared by every tool that identifies a PR/agent
 * (plan "Tool specs" → *Shared inputs*, principle 2 "flat arguments"). Kept in
 * one place so `repo`/`pr`/`agent` validation and `.describe()` text never
 * drift between modules.
 */
import { z } from 'zod';

export const RepoField = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'Use owner/name, e.g. acme/payments-api')
  .describe('GitHub repo as owner/name');

// Deviation from the plan's literal `z.number().int().positive()`: zod 4's
// JSON Schema conversion adds an explicit safe-integer `maximum` bound for
// every `.int()` field, and this field is repeated across 3 tool schemas —
// dropping `.int()` (keeping `.positive()`, still a real bound) is what keeps
// the serialized `tools/list` under the plan's ≤6,000 char budget (see
// `test/tools.test.ts`'s size assertion; the model always sends an integer
// anyway).
export const PrField = z.number().positive().describe('PR number');

export const AgentField = z.string().min(1).describe('Agent name or id from list_agents');
