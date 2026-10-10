import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { LLMProvider } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../lib/diff-parser.js';
import type { EvalEngine } from './ports.js';

type Strategy = Parameters<typeof reviewPullRequest>[0]['strategy'];

/**
 * The eval review engine: the SAME `reviewPullRequest` a PR review uses (so the
 * diff gets the untrusted wrapper + injection guard, NFR-2, and the grounding
 * gate), fed ONLY the inputs of `EvalEngineInput` (AC-10). No repo-intel callers
 * or map, project-context docs, memory, intent or PR description, whatever the
 * agent's own settings say. No retry here (NFR-8): a failure propagates.
 */
export function createEvalEngine(resolveLlm: (provider: string) => Promise<LLMProvider>): EvalEngine {
  return {
    async review(input) {
      const llm = await resolveLlm(input.provider);
      const outcome = await reviewPullRequest({
        systemPrompt: input.systemPrompt,
        model: input.model,
        diff: parseUnifiedDiff(input.diff),
        llm,
        strategy: input.strategy as Strategy,
        ...(input.skills.length > 0 ? { skills: input.skills } : {}),
        task: input.task,
      });
      return {
        findings: outcome.review.findings,
        keptCount: outcome.review.findings.length,
        droppedCount: outcome.dropped.length,
        costUsd: outcome.costUsd,
      };
    },
  };
}
