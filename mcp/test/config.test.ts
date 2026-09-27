/**
 * `platform/config.ts`'s `loadConfig` — the only file that reads
 * `process.env`, per `mcp/AGENTS.md`. Tested by passing a custom `env`
 * object (the function's own seam for this), never mutating the real
 * `process.env`.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

describe('loadConfig — defaults', () => {
  it('defaults apiUrl and waitMs when the env is empty', () => {
    const config = loadConfig({});
    expect(config.apiUrl).toBe('http://localhost:3001');
    expect(config.waitMs).toBe(100_000);
  });

  it('strips a trailing slash from a custom DEVDIGEST_API_URL', () => {
    const config = loadConfig({ DEVDIGEST_API_URL: 'http://example.com:4000/' });
    expect(config.apiUrl).toBe('http://example.com:4000');
  });

  it('trims whitespace around DEVDIGEST_API_URL', () => {
    const config = loadConfig({ DEVDIGEST_API_URL: '  http://example.com:4000  ' });
    expect(config.apiUrl).toBe('http://example.com:4000');
  });
});

describe('loadConfig — DEVDIGEST_MCP_WAIT_MS clamping', () => {
  it('clamps a value below the 10,000 ms floor up to the floor', () => {
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: '500' }).waitMs).toBe(10_000);
  });

  it('clamps a value above the 110,000 ms ceiling down to the ceiling', () => {
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: '999999' }).waitMs).toBe(110_000);
  });

  it('passes a value inside the [10s, 110s] range through unchanged', () => {
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: '50000' }).waitMs).toBe(50_000);
  });

  it('falls back to the 100,000 ms default on a non-numeric value', () => {
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: 'not-a-number' }).waitMs).toBe(100_000);
  });

  it('falls back to the default on zero or a negative value', () => {
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: '0' }).waitMs).toBe(100_000);
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: '-5000' }).waitMs).toBe(100_000);
  });
});
