import { McpServer } from '@modelcontextprotocol/server';
import type { AppContainer } from './platform/container.js';
import { registerModules } from './modules/index.js';

/** Must stay short: budgeted at ≤160 chars, enforced by `test/tools.test.ts`. */
const SERVER_INSTRUCTIONS = 'DevDigest: AI PR review. Identify PRs by repo "owner/name" + pr number.';

/** Matches `package.json`'s `version` — not read from disk to keep the entry point network/IO-free before `connect()`. */
const SERVER_VERSION = '0.0.0';

/**
 * `createApp(container)` — builds the `McpServer` and hands the container to
 * `registerModules` (`modules/index.ts`), which registers each module's
 * tool(s) against it. This file never constructs a concrete
 * repository/service itself; it only wires what the container (built by
 * `platform/container.ts`) handed it.
 */
export function createApp(container: AppContainer): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS, capabilities: { tools: {} } },
  );

  registerModules(server, container);

  return server;
}
