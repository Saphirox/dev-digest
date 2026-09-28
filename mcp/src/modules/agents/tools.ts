import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../../platform/container.js';
import { AgentsApiRepository } from './repository.js';
import { AgentsService } from './service.js';
import { renderAgentLine } from './render.js';
import { toToolResult, noAgentsMessage } from '../_shared/messages.js';

const OutputSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      description: z.string(),
    }),
  ),
});

/** `list_agents` — no input, never returns the system prompt. */
export function registerListAgentsTool(server: McpServer, service: AgentsService): void {
  server.registerTool(
    'list_agents',
    {
      description:
        'List DevDigest reviewer agents (name, id, model, enabled). Pass a name or id as `agent` to run_agent_on_pr.',
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const result = await service.listAgents();
        return {
          structuredContent: result,
          content: [{ type: 'text', text: result.agents.map(renderAgentLine).join('\n') || noAgentsMessage() }],
        };
      } catch (err) {
        return toToolResult(err, { tool: 'list_agents' });
      }
    },
  );
}

/**
 * Builds this module's repository + service from the container and
 * registers its tool — mirrors a Fastify `routes.ts` building its service
 * from `container.db` (`server/src/modules/pulls/routes.ts:26-30`).
 */
export function registerAgentsTools(server: McpServer, container: AppContainer): void {
  const service = new AgentsService({ store: new AgentsApiRepository(container.client) });
  registerListAgentsTool(server, service);
}
