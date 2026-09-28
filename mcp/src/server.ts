import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './platform/config.js';
import { Container } from './platform/container.js';
import { createApp } from './app.js';
import { log } from './platform/log.js';

/**
 * Entry point. Nothing above `connect()` performs network I/O: `loadConfig`
 * only reads env, `new Container(config)` only constructs the HTTP client and
 * the shared `Resolver` (no request is made until a tool call — a module's
 * own repository/service are built later, by that module's `tools.ts`, not
 * here), `createApp` only registers tool callbacks — the first `fetch`
 * happens inside a tool call, after the client has already completed the
 * handshake.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const container = new Container(config);
  const server = createApp(container);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('ready', { apiUrl: config.apiUrl, waitMs: config.waitMs });
}

main().catch((err: unknown) => {
  log.error('fatal', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
