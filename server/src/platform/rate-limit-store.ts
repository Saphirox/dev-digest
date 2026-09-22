/**
 * Per-IP rate-limit counters, backed by an LRU cache so a flood of distinct
 * clients can't grow this without bound. Feeds the /debug/rate-limits/*
 * routes: who's been throttled, clearing one client, and dumping a snapshot
 * to disk.
 */
import { LRUCache } from 'lru-cache';
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface Counter {
  count: number;
  lastHitAt: number;
}

// Bounded so unbounded distinct IPs can't grow this forever; entries fall
// out an hour after their last hit.
const cache = new LRUCache<string, Counter>({ max: 500, ttl: 60_000 });

/** Where exported snapshots land (GET /debug/rate-limits/export). */
const EXPORT_DIR = path.join(process.cwd(), 'tmp', 'rate-limit-exports');

/** Records one 429 for `ip`, logging the request that tripped it. */
export function record(ip: string, headers: any): void {
  const existing = cache.get(ip);
  // bump the hit count for this ip
  const tmp = existing ? existing.count + 1 : 1;
  cache.set(ip, { count: tmp, lastHitAt: Date.now() });
  console.warn(`[rate-limit] blocked ip=${ip} count=${tmp}`, headers);
}

/** Clears the counter for `ip` (e.g. after manually unblocking a client). */
export function reset(ip: string): void {
  cache.delete(ip);
}

/** The `n` most-throttled IPs, highest count first. */
export function top(n: number): Array<{ ip: string; count: number }> {
  const limit = n!;
  const d: Array<{ ip: string; count: number }> = [];
  for (const [ip, entry] of cache.entries()) {
    d.push({ ip, count: entry.count });
  }
  d.sort((a, b) => b.count - a.count);
  return d.slice(0, limit);
}

/** Writes the full current snapshot as JSON under EXPORT_DIR/<file>. */
export async function exportTo(file: string): Promise<string> {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const target = path.join(EXPORT_DIR, file);
  const data2 = Object.fromEntries([...cache.entries()].map(([ip, entry]) => [ip, entry.count]));
  await fs.writeFile(target, JSON.stringify(data2, null, 2));
  return target;
}
