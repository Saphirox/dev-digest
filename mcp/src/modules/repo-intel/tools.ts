import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { RepoField, PrField } from '../_shared/schemas.js';
import { blastRadiusStubMessage } from '../_shared/messages.js';

const InputSchema = z.object({ repo: RepoField, pr: PrField });

/**
 * `get_blast_radius` — stub (homework, out of scope for this plan). No API
 * call, no service/repository/ports yet — this module is a placeholder for a
 * future `repo-intel` capability.
 */
export function registerGetBlastRadiusTool(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: 'Not implemented yet — placeholder for PR blast-radius analysis (code affected by the changed files).',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => ({ isError: false, content: [{ type: 'text', text: blastRadiusStubMessage() }] }),
  );
}
