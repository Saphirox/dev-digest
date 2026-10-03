/**
 * Regression: a background job that fails while nobody awaits `done` must not
 * raise an unhandled rejection — under Node that exits the whole API process
 * (seen with a repo-intel index job hitting a duplicate-key insert).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { JobRunner } from '../src/platform/jobs.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('JobRunner: failed fire-and-forget jobs', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('records the failure on the jobs row and raises no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const jobs = new JobRunner(pg.handle.db, { retries: 0 });
      jobs.register('boom', async () => {
        throw new Error('duplicate key');
      });

      const { id } = await jobs.enqueue(workspaceId, 'boom', {}); // `done` deliberately ignored
      await jobs.onIdle();
      await new Promise((r) => setTimeout(r, 20)); // let Node report any unhandled rejection

      const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, id));
      expect(row!.status).toBe('failed');
      expect(row!.error).toBe('duplicate key');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('still rejects `done` for callers that await it', async () => {
    const jobs = new JobRunner(pg.handle.db, { retries: 0 });
    jobs.register('boom', async () => {
      throw new Error('nope');
    });
    const { done } = await jobs.enqueue(workspaceId, 'boom', {});
    await expect(done).rejects.toThrow('nope');
  });
});
