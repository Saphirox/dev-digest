import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../../platform/container.js';
import { BlastApiRepository } from './repository.js';
import { BlastService } from './service.js';
import { renderBlastRadius } from './render.js';
import { toToolResult, degradedReasonMessage, noCallersMessage } from '../_shared/messages.js';
import { RepoField, PrField } from '../_shared/schemas.js';

const InputSchema = z.object({ repo: RepoField, pr: PrField });

/**
 * `get_blast_radius` — symbols a PR changed, their callers (file:line), and
 * the endpoints/crons that depend on them. Reads only the precomputed
 * repo-intel index; never an LLM call. Text-only content, no `outputSchema`:
 * the `tools/list` budget has only ~50 chars of headroom (mcp INSIGHTS
 * 2026-09-26), and a JSON Schema for this nested per-symbol/caller shape
 * would blow well past it (plan 0011 Risks: "MCP budget").
 */
export function registerGetBlastRadiusTool(server: McpServer, service: Pick<BlastService, 'getBlastRadius'>): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        'Symbols a PR changed, their callers (file:line), and endpoints/crons affected. Read-only, no LLM cost.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const result = await service.getBlastRadius({ repo: args.repo, pr: args.pr });
        let text = renderBlastRadius(result.pr, result.blast, noCallersMessage());
        if (result.blast.degraded && result.blast.reason) {
          text = `${degradedReasonMessage(result.blast.reason)}\n${text}`;
        }
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolResult(err, { tool: 'get_blast_radius', repo: args.repo, pr: args.pr });
      }
    },
  );
}

/**
 * Builds this module's repository + service from the container and registers
 * its tool — mirrors a Fastify `routes.ts` building its service from
 * `container.db` (`server/src/modules/pulls/routes.ts:26-30`).
 */
export function registerBlastTools(server: McpServer, container: AppContainer): void {
  const service = new BlastService({
    store: new BlastApiRepository(container.client),
    resolver: container.resolver,
  });
  registerGetBlastRadiusTool(server, service);
}
