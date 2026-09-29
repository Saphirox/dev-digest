import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsStore } from './ports.js';
import type { SettingsRow } from './helpers.js';

/**
 * F1 — settings data-access layer. The ONLY place that touches the
 * `settings` table.
 */
export class SettingsRepository implements SettingsStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SettingsRow[]> {
    return this.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
  }

  /**
   * Upsert every `(key, value)` entry in one `db.transaction` — either every
   * key in the PUT body lands, or none do (same conflict target as the
   * pre-refactor route: `(workspaceId, userId, key)`).
   */
  async upsertMany(
    workspaceId: string,
    userId: string,
    entries: [string, unknown][],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx
          .insert(t.settings)
          .values({ workspaceId, userId, key, value })
          .onConflictDoUpdate({
            target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
            set: { value },
          });
      }
    });
  }
}
