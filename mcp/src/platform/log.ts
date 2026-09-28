/**
 * stderr-only logger. stdout is the JSON-RPC transport for stdio MCP servers —
 * nothing in `mcp/src` may write to it (`console.log` is banned repo-wide for
 * this package).
 */

type Level = 'info' | 'warn' | 'error';

function write(level: Level, msg: string, data?: Record<string, unknown>): void {
  const line: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(data ? { data } : {}),
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
};
