import { z } from 'zod';
import { ApiUnreachable, ApiFailure, RateLimited, MalformedResponse } from '../../platform/errors.js';
import { truncate } from '../../lib/text.js';

/**
 * The only `fetch` caller in this package (Onion layering: adapters may call
 * out, everything else never does). Every model-supplied id a repository
 * forwards (`prId`/`repoId`/`agentId`) has already been resolved to an
 * API-issued uuid by `modules/_shared/resolver.ts` before it reaches here;
 * every path segment is still `encodeURIComponent`'d by the repository as
 * defence in depth. This client knows no module or schema — it only maps
 * transport-level failures (network, timeout, 429, the `{error:{message}}`
 * envelope) to `platform/errors`. Response-shape validation is each module's
 * `repository.ts`'s job (`parseArray`/`parseObject` below are shared plumbing
 * for that, not a schema this client owns).
 */

const TIMEOUT_MS = 15_000;
const MAX_MESSAGE_LEN = 200;

/** Matches the API's `{error:{code,message,details}}` envelope (`app.ts` error handler). */
const ErrorBodySchema = z
  .object({
    error: z.object({ message: z.string() }),
  })
  .partial();

export class DevDigestApiClient {
  constructor(private readonly apiUrl: string) {}

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
    } catch {
      // Network error (ECONNREFUSED, DNS failure) or the 15s timeout — the API
      // is not reachable, whatever the underlying cause.
      throw new ApiUnreachable(this.apiUrl);
    }

    if (res.status === 429) throw new RateLimited();
    if (!res.ok) {
      const rawBody: unknown = await res.json().catch(() => undefined);
      const parsedError = ErrorBodySchema.safeParse(rawBody);
      const message =
        parsedError.success && parsedError.data.error?.message
          ? parsedError.data.error.message
          : res.statusText || `HTTP ${res.status}`;
      throw new ApiFailure(res.status, truncate(message, MAX_MESSAGE_LEN));
    }
    try {
      return await res.json();
    } catch {
      // A 2xx status but the body isn't valid JSON — a schema/shape problem,
      // not a transport failure, so `MalformedResponse` (not `ApiFailure`) is
      // the accurate typed error; still never a raw SyntaxError escaping the
      // adapter. `endpoint` carries method+path (e.g. `GET /agents`), same
      // shape as a repository's own `parseArray`/`parseObject` endpoint arg.
      const method = init?.method ?? 'GET';
      throw new MalformedResponse(`${method} ${path}`);
    }
  }

  get(path: string): Promise<unknown> {
    return this.fetchJson(path);
  }

  post(path: string, body: unknown): Promise<unknown> {
    return this.fetchJson(path, { method: 'POST', body: JSON.stringify(body) });
  }
}

// ---- Shared response-validation plumbing for `repository.ts` files. Each
// repository owns its own zod schemas; these two generics just turn a failed
// `safeParse` into the one typed error every repository throws. -----------

export function parseArray<T>(schema: z.ZodType, body: unknown, endpoint: string): T[] {
  const result = z.array(schema).safeParse(body);
  if (!result.success) {
    throw new MalformedResponse(endpoint);
  }
  return result.data as T[];
}

export function parseObject<T>(schema: z.ZodType, body: unknown, endpoint: string): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new MalformedResponse(endpoint);
  }
  return result.data as T;
}
