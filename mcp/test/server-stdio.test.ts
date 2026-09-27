/**
 * Smoke test for the real entry point (`src/server.ts`), spawned as a
 * separate process — the only test in this package that does NOT go through
 * `createApp`/`InMemoryTransport`. Proves the non-default convention in
 * `mcp/AGENTS.md`: "stdout carries JSON-RPC only" — a stray `console.log`
 * anywhere in `src/` would corrupt this. `DEVDIGEST_API_URL` points at an
 * unreachable port; that's fine because `initialize`/`tools/list` never call
 * the DevDigest API (`mcp/AGENTS.md`: "Nothing above `connect()` performs
 * network I/O", and neither request triggers a tool call).
 *
 * Uses the real `StdioClientTransport` (`@modelcontextprotocol/client`) for
 * a correct protocol handshake (version negotiation, `initialized`
 * notification) instead of hand-rolling the wire format, while independently
 * tapping the spawned child's raw `stdout` stream (`transport['_process']`
 * — a public runtime property; only `private` in the `.d.ts`) to assert on
 * the literal bytes, not just what the client happened to parse.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const TSX_BIN = join(PACKAGE_ROOT, 'node_modules', '.bin', 'tsx');

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('server.ts entry point (spawned stdio process)', () => {
  it(
    'emits only valid JSON-RPC lines on stdout; "ready" is logged to stderr, never stdout',
    async () => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const transport = new StdioClientTransport({
        command: TSX_BIN,
        args: ['src/server.ts'],
        cwd: PACKAGE_ROOT,
        env: { DEVDIGEST_API_URL: 'http://127.0.0.1:1', DEVDIGEST_MCP_WAIT_MS: '10000' },
        stderr: 'pipe',
      });

      client = new Client({ name: 'smoke-test-client', version: '0.0.0' });
      await client.connect(transport);

      // Tap the raw bytes independently of the transport's own JSON-RPC
      // parsing — a stray `console.log` would still show up here even if it
      // happened to not break `readMessage()` (e.g. a line that IS valid JSON
      // but isn't a JSON-RPC envelope).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-only access to a TS-private field.
      const child: ChildProcess = (transport as any)._process;
      child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      transport.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      await client.close();
      client = undefined;

      const stdoutLines = Buffer.concat(stdoutChunks)
        .toString('utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0);

      expect(stdoutLines.length).toBeGreaterThan(0);
      for (const line of stdoutLines) {
        const parsed: unknown = JSON.parse(line); // throws (fails the test) on a non-JSON stdout line
        expect(parsed).toHaveProperty('jsonrpc', '2.0');
      }

      const stderrText = Buffer.concat(stderrChunks).toString('utf8');
      expect(stderrText).toMatch(/"msg":"ready"/);
      // The "ready" log line must never leak onto stdout (it would corrupt JSON-RPC framing there).
      expect(stdoutLines.some((line) => line.includes('"msg":"ready"'))).toBe(false);
    },
    15_000,
  );
});
