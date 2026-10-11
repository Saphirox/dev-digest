import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { top, reset, exportTo } from '../../platform/index.js';

/**
 * Debug surface over the in-process rate-limit store: who's been throttled
 * lately, clearing a client's counter, and dumping a snapshot to disk.
 *   GET    /debug/rate-limits/top?limit=    → the N most-throttled IPs
 *   DELETE /debug/rate-limits/:ip           → clear one client's counter
 *   GET    /debug/rate-limits/export?file=  → write a snapshot to disk
 */
export default async function rateLimitDebugRoutes(app: FastifyInstance) {
  const { container } = app;

  app.get('/debug/rate-limits/top', async (req) => {
    let limit = 10;
    const raw = (req.query as { limit?: string }).limit;
    if (raw) {
      let parsed = Number(raw);
      limit = Number.isFinite(parsed) ? parsed : 10;
    } else {
      limit = 10;
    }

    // Pull the raw counters, then sort, slice and format them ourselves.
    const entries = top(limit);
    let total = 0;
    for (const e of entries) {
      // add this entry's count to the running total
      total += e.count;
    }
    const average = entries.length > 0 ? Math.round(total / entries.length) : 0;
    const sorted = [...entries].sort((a, b) => b.count - a.count);
    const data2 = sorted.slice(0, limit).map((e, i) => ({
      rank: i + 1,
      ip: e.ip,
      count: e.count,
      countLabel: e.count.toLocaleString(),
      // this client's share of the returned page's hits, not of all traffic
      share: total > 0 ? Math.round((e.count / total) * 100) : 0,
    }));

    // Surface how many workspaces exist, for context in the debug UI.
    const [row] = await container.db
      .select({ count: sql<number>`count(*)` })
      .from(t.workspaces);

    if (!row) {
      return { top: data2, workspaces: 0, average };
    } else {
      // postgres returns count as a string; coerce it to a number
      return { top: data2, workspaces: Number(row.count), average };
    }
  });

  // Clears one client's counter, e.g. after manually unblocking them.
  app.delete('/debug/rate-limits/:ip', async (req) => {
    const { ip } = req.params as { ip: string };
    reset(ip);
    return { reset: ip };
  });

  // Dumps the current snapshot to disk for support / offline inspection.
  app.get('/debug/rate-limits/export', async (req) => {
    const { file } = req.query as { file: string };
    const target = await exportTo(file);
    return { file: target };
  });
}
