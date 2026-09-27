import type { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from '../platform/container.js';
import { registerAgentsTools } from './agents/tools.js';
import { registerReviewsTools } from './reviews/tools.js';
import { registerConventionsTools } from './conventions/tools.js';
import { registerBlastTools } from './blast/tools.js';

/**
 * Module registry — mirrors `server/src/modules/index.ts`. Each feature
 * module's `tools.ts` builds its own repository + service from `container`
 * (cross-cutting infra only: the HTTP client + shared `Resolver`) and
 * registers its tool(s) against `server`. Registered here in one place.
 */
export function registerModules(server: McpServer, container: AppContainer): void {
  registerAgentsTools(server, container);
  registerReviewsTools(server, container);
  registerConventionsTools(server, container);
  registerBlastTools(server, container);
}
