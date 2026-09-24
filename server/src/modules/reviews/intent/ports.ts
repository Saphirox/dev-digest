import type { ChatMessage, IssueMeta, PrIntentRecord, RepoRef } from '@devdigest/shared';
import type { IntentClassification } from './prompt.js';

/**
 * Intent Layer ports. What `IntentService` needs from the outside world,
 * declared next to it (dependency inversion) — never next to the Drizzle
 * class or the concrete GitHub/git adapters. The module plugin wires these to
 * the container; tests use fakes.
 */

/** Everything the service persists, minus `pr_id`/`stale` (service-computed). */
export interface IntentUpsertInput {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  derivedForSha: string;
  sources: PrIntentRecord['sources'];
  missingContext: string[];
  provider: string;
  model: string;
}

export interface IntentStore {
  get(prId: string): Promise<PrIntentRecord | undefined>;
  upsert(prId: string, record: IntentUpsertInput): Promise<void>;
}

/** Evidence sources the classifier reads from — GitHub (linked issue) and git
 *  (linked repo docs). Both best-effort: a throw means "unreachable". */
export interface IntentSources {
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
  readFile(repo: RepoRef, path: string): Promise<string>;
}

export interface IntentModel {
  classify(
    workspaceId: string,
    messages: ChatMessage[],
  ): Promise<{ data: IntentClassification; model: string; provider: string; costUsd: number | null }>;
}

export interface Tokens {
  count(text: string): number;
}
