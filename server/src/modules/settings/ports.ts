import type { SettingsRow } from './helpers.js';

/**
 * F1 — settings ports. What `SettingsService` needs from the outside world,
 * declared next to it (dependency inversion): `SettingsRepository implements
 * SettingsStore`; tests pass a fake.
 */
export interface SettingsStore {
  list(workspaceId: string): Promise<SettingsRow[]>;
  /** Upsert every entry atomically (one `db.transaction`). */
  upsertMany(workspaceId: string, userId: string, entries: [string, unknown][]): Promise<void>;
}
