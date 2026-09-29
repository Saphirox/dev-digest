/**
 * `SettingsRepository.upsertMany` (plan 0013 Step 7/9) — proves the whole
 * call is one `db.transaction`: a mid-way NOT NULL violation (`settings.key`,
 * `db/schema/core.ts:42`) rolls back every entry from the SAME call,
 * including ones that would otherwise have inserted cleanly earlier in the
 * loop.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SettingsRepository } from '../src/modules/settings/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('SettingsRepository.upsertMany (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let userId: string;
  let repo: SettingsRepository;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    userId = seeded.userId;
    repo = new SettingsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function rowsFor(keys: string[]) {
    const rows = await pg.handle.db
      .select()
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.userId, userId)));
    return rows.filter((r) => keys.includes(r.key));
  }

  it('happy path: every entry in the call is persisted', async () => {
    await repo.upsertMany(workspaceId, userId, [
      ['ok_key_a', { v: 1 }],
      ['ok_key_b', { v: 2 }],
    ]);

    const rows = await rowsFor(['ok_key_a', 'ok_key_b']);
    expect(rows.map((r) => r.key).sort()).toEqual(['ok_key_a', 'ok_key_b']);
  });

  it('a mid-way NULL-cast key rejects AND rolls back an earlier entry from the same call', async () => {
    // `settings.key` is NOT NULL (`db/schema/core.ts:42`). The first entry
    // would insert cleanly on its own — proving this isn't just "the bad row
    // failed", but that the transaction rolled back a write that otherwise
    // succeeds.
    await expect(
      repo.upsertMany(workspaceId, userId, [
        ['rollback_should_not_stick', { v: 'first' }],
        [null as unknown as string, { v: 'bad' }],
      ]),
    ).rejects.toThrow();

    const rows = await rowsFor(['rollback_should_not_stick']);
    expect(rows).toEqual([]);
  });
});
