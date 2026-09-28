/**
 * Env is read here ONCE, at process start. Every other module receives
 * `apiUrl`/`waitMs` as plain parameters (Onion layering "Config inward as
 * values") — no other file reads `process.env`.
 */

const DEFAULT_API_URL = 'http://localhost:3001';
const DEFAULT_WAIT_MS = 100_000;
const MIN_WAIT_MS = 10_000;
const MAX_WAIT_MS = 110_000;

export interface Config {
  /** Base URL of the running DevDigest API, no trailing slash. */
  apiUrl: string;
  /** `run_agent_on_pr` polling budget in ms, clamped to [10s, 110s]. */
  waitMs: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Pass a custom `env` in tests; production callers use the default `process.env`. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUrl = env.DEVDIGEST_API_URL?.trim();
  const apiUrl = rawUrl ? rawUrl.replace(/\/+$/, '') : DEFAULT_API_URL;

  const rawWaitMs = Number(env.DEVDIGEST_MCP_WAIT_MS);
  const waitMs =
    Number.isFinite(rawWaitMs) && rawWaitMs > 0
      ? clamp(rawWaitMs, MIN_WAIT_MS, MAX_WAIT_MS)
      : DEFAULT_WAIT_MS;

  return { apiUrl, waitMs };
}
