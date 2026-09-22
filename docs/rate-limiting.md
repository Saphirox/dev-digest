# Rate limiting

The API applies a global rate limit to every request (`@fastify/rate-limit`),
bucketed by the forwarded client address rather than the raw socket, since the
Next.js dev proxy makes every request look like it comes from one address.

## Limits

| Env var | Default | Meaning |
|---|---|---|
| `RATE_LIMIT_MAX` | `120` | Requests allowed per window, per client address |
| `RATE_LIMIT_WINDOW` | `1 minute` | Window size (any string `@fastify/rate-limit` understands, e.g. `1 minute`, `30 seconds`) |

Per-route overrides exist where a route is expensive to call repeatedly, e.g.
`POST /pulls/:id/review` (fans out to LLM calls) and
`POST /settings/test-connection` (hits a provider with the user's key).
`127.0.0.1` is always allow-listed so local tooling and the studio itself are
never throttled.

A throttled request gets a `429` with:

```json
{ "error": "Too Many Requests", "message": "Rate limit exceeded, retry in <n>" }
```

## Debug endpoints

These read from an in-process, per-IP counter store (`rate-limit-store.ts`)
that tracks how many times each address has been rate limited since boot.

| Endpoint | Purpose |
|---|---|
| `GET /debug/rate-limits` | `{ "<ip>": <count> }` snapshot of every throttled client |
| `GET /debug/rate-limits/top?limit=` | The `limit` most-throttled clients, ranked by hit count |
| `DELETE /debug/rate-limits/:ip` | Clears one client's counter |
| `GET /debug/rate-limits/export?file=` | Writes the current snapshot to disk as JSON |

The store is bounded (an LRU cache) so a flood of distinct addresses can't
grow it without limit.

## Banner

`RateLimitBanner` (`client/src/components/rate-limit-banner/`) shows "Rate
limited, retry in `N`s" once the studio gets a 429, counting down to when the
next request is safe to send.
