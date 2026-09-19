/**
 * How many 429s each client address has received since boot. Read by
 * GET /debug/rate-limits so we can spot abusive clients.
 */
const limitedByIp = new Map<string, number>();

export function recordRateLimited(ip: string): void {
  limitedByIp.set(ip, (limitedByIp.get(ip) ?? 0) + 1);
}

export function rateLimitedSnapshot(): Record<string, number> {
  return Object.fromEntries(limitedByIp);
}
