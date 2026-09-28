import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../../platform/container.js';
import { ConventionsApiRepository } from './repository.js';
import { ConventionsService } from './service.js';
import { toToolResult, noConventionsMessage } from '../_shared/messages.js';
import { RepoField } from '../_shared/schemas.js';
import { renderConventionLine } from './render.js';

const InputSchema = z.object({ repo: RepoField });

const OutputSchema = z.object({
  repo: z.string(),
  last_scan_at: z.string().nullable(),
  conventions: z.array(
    z.object({
      rule: z.string(),
      category: z.string(),
      status: z.string(),
      evidence: z.string(),
    }),
  ),
  more: z.number(),
  next: z.string().optional(),
});

/** `get_conventions` — all statuses, accepted first; never triggers extraction. */
export function registerGetConventionsTool(server: McpServer, service: ConventionsService): void {
  server.registerTool(
    'get_conventions',
    {
      description:
        'Coding conventions extracted for a repo, all statuses (rule, category, status, evidence file:line). Never runs extraction.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const result = await service.getConventions({ repo: args.repo });
        const isEmpty = result.conventions.length === 0;
        const structuredContent = {
          repo: result.repo,
          last_scan_at: result.last_scan_at,
          conventions: result.conventions,
          more: result.more,
          ...(isEmpty ? { next: noConventionsMessage(result.repo) } : {}),
        };
        const text = isEmpty
          ? noConventionsMessage(result.repo)
          : result.conventions.map(renderConventionLine).join('\n');
        return { structuredContent, content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolResult(err, { tool: 'get_conventions', repo: args.repo });
      }
    },
  );
}

/**
 * Builds this module's repository + service from the container and
 * registers its tool — mirrors a Fastify `routes.ts` building its service
 * from `container.db` (`server/src/modules/pulls/routes.ts:26-30`).
 */
export function registerConventionsTools(server: McpServer, container: AppContainer): void {
  const service = new ConventionsService({
    store: new ConventionsApiRepository(container.client),
    resolver: container.resolver,
  });
  registerGetConventionsTool(server, service);
}
