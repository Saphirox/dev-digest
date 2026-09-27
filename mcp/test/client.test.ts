/**
 * `DevDigestApiClient` — the only file that calls `fetch`. Stubs
 * `globalThis.fetch` so this test never touches the network (root INSIGHTS
 * 2026-09-21: shared dev DB rows get replaced by other sessions). This client
 * knows no module/schema, so it's tested only on transport-level concerns
 * (network failure, timeout, the error envelope, the request shape); response
 * shape validation is each module's `repository.ts`'s job — see
 * `repositories.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevDigestApiClient } from '../src/adapters/devdigest-api/client.js';
import { ApiUnreachable, ApiFailure, RateLimited, MalformedResponse } from '../src/platform/errors.js';

const API_URL = 'http://localhost:3001';

function jsonResponse(status: number, body: unknown, statusText = ''): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DevDigestApiClient — happy paths', () => {
  it('get() sends a plain request with the content-type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new DevDigestApiClient(API_URL);
    await expect(client.get('/agents')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/agents`,
      expect.objectContaining({ headers: expect.objectContaining({ 'content-type': 'application/json' }) }),
    );
  });

  it('post() sends a JSON body and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { runs: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new DevDigestApiClient(API_URL);
    await client.post('/pulls/p1/review', { agentId: 'a1' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ agentId: 'a1' });
  });
});

describe('DevDigestApiClient — error mapping', () => {
  it('maps a network failure to ApiUnreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const client = new DevDigestApiClient(API_URL);
    await expect(client.get('/agents')).rejects.toBeInstanceOf(ApiUnreachable);
  });

  it('maps 429 to RateLimited without reading the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { error: { message: 'slow down' } })));

    const client = new DevDigestApiClient(API_URL);
    await expect(client.get('/agents')).rejects.toBeInstanceOf(RateLimited);
  });

  it('maps a 404 with the API error envelope to ApiFailure(status, message)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'not_found', message: 'Pull request not found' } })),
    );

    const client = new DevDigestApiClient(API_URL);
    const err = await client.get('/agents').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).status).toBe(404);
    expect((err as ApiFailure).apiMessage).toBe('Pull request not found');
  });

  it('falls back to statusText when the body does not match the error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { oops: true }, 'Internal Server Error')));

    const client = new DevDigestApiClient(API_URL);
    const err = await client.get('/agents').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).status).toBe(500);
    expect((err as ApiFailure).apiMessage).toBe('Internal Server Error');
  });

  it('falls back to statusText when the error response body is not valid JSON at all', async () => {
    const notJson = new Response('<html>Internal Server Error</html>', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'content-type': 'text/html' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notJson));

    const client = new DevDigestApiClient(API_URL);
    const err = await client.get('/agents').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).status).toBe(500);
    expect((err as ApiFailure).apiMessage).toBe('Internal Server Error');
  });

  it('truncates a long server error message to <=200 chars', async () => {
    const longMessage = 'x'.repeat(500);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: longMessage } })),
    );

    const client = new DevDigestApiClient(API_URL);
    const err = await client.get('/agents').catch((e: unknown) => e);
    expect((err as ApiFailure).apiMessage.length).toBeLessThanOrEqual(200);
  });
});

describe('DevDigestApiClient — non-JSON success body', () => {
  // A 2xx status whose body isn't valid JSON is a schema/shape problem, not a
  // transport failure — `client.ts`'s success-path `res.json()` is wrapped in
  // its own try/catch and maps a parse failure to `MalformedResponse` (method
  // + path as the endpoint, e.g. `GET /agents`), never a raw `SyntaxError`
  // escaping the adapter (`mcp/AGENTS.md`: a service never throws anything
  // but a typed `McpError`).
  it('maps a malformed 200 body to MalformedResponse, not a raw SyntaxError', async () => {
    const malformed = new Response('not json at all {', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(malformed));

    const client = new DevDigestApiClient(API_URL);
    const err = await client.get('/agents').catch((e: unknown) => e);

    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(
      err instanceof ApiUnreachable || err instanceof ApiFailure || err instanceof MalformedResponse,
    ).toBe(true);
    expect(err).toBeInstanceOf(MalformedResponse);
    expect((err as MalformedResponse).endpoint).toBe('GET /agents');
  });
});
