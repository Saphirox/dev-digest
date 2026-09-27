import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../platform/container.js';
import { registerAgentsTools } from './agents/tools.js';
import { registerReviewsTools } from './reviews/tools.js';
import { registerConventionsTools } from './conventions/tools.js';
import { registerGetBlastRadiusTool } from './repo-intel/tools.js';

/**
 * Module registry — mirrors `server/src/modules/index.ts`. Each feature
 * module's `tools.ts` builds its own repository + service from `container`
 * (cross-cutting infra only: the HTTP client + shared `Resolver`) and
 * registers its tool(s) against `server`. Registered here in one place.
 * `repo-intel` has no repository/service yet (`get_blast_radius` is a stub),
 * so its registration function takes no container.
 */
export function registerModules(server: McpServer, container: AppContainer): void {
  registerAgentsTools(server, container);
  registerReviewsTools(server, container);
  registerConventionsTools(server, container);
  registerGetBlastRadiusTool(server);
}
