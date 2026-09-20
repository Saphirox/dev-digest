import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent -----------------------------------------------------------------

/** Fields the intent service derives; `pr_id` and `stale` are not stored (`stale`
 *  is always recomputed against the PR's current head_sha by the service). */
export interface IntentUpsertInput {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: number | null;
  derivedForSha: string;
  sources: IntentSource[];
  missingContext: string[];
  provider: string;
  model: string;
}

export async function upsertIntent(db: Db, prId: string, record: IntentUpsertInput): Promise<void> {
  const values = {
    prId,
    intent: record.intent,
    inScope: record.inScope,
    outOfScope: record.outOfScope,
    confidence: record.confidence,
    derivedForSha: record.derivedForSha,
    sources: record.sources,
    missingContext: record.missingContext,
    provider: record.provider,
    model: record.model,
    derivedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

/** `stale` is always `false` here — the repository has no `head_sha` to compare
 *  against; `IntentService.get`/`ensureFresh` recomputes it before returning. */
export async function getIntent(db: Db, prId: string): Promise<PrIntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    derived_for_sha: row.derivedForSha,
    derived_at: row.derivedAt?.toISOString() ?? null,
    stale: false,
    sources: row.sources,
    missing_context: row.missingContext,
    provider: row.provider,
    model: row.model,
  };
}
