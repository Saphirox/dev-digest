/**
 * `PullsRepository.replaceDetail` — plan 0013 Step 12 wraps this in
 * `this.db.transaction(...)`. Today the four writes (delete pr_files, insert
 * pr_files, delete pr_commits, insert pr_commits, update pull_requests) are
 * unwrapped, so a mid-way failure (e.g. a NOT NULL violation on the new
 * commit) leaves the PR in a half-replaced state instead of rolling back to
 * the old files/commit/body. The rollback case below is expected RED today.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrDetail } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('PullsRepository.replaceDetail (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: PullsRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    repo = new PullsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPrWithDetail(): Promise<string> {
    const name = `replace-detail-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: r!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'h',
        body: 'old',
        additions: 1,
        deletions: 0,
        filesCount: 1,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'a.ts',
      additions: 1,
      deletions: 0,
      patch: null,
    });
    await pg.handle.db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'old-sha',
      message: 'old commit',
      author: 'a',
    });
    return pr!.id;
  }

  it('happy path: replaces files/commits and refreshes body + diff stats', async () => {
    const prId = await newPrWithDetail();
    const detail: PrDetail = {
      number: 1,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'new-sha',
      additions: 5,
      deletions: 2,
      files_count: 1,
      status: 'open',
      body: 'new body',
      files: [{ path: 'b.ts', additions: 5, deletions: 2, patch: null }],
      commits: [{ sha: 'new-sha', message: 'new commit', author: 'a', committed_at: null }],
    };

    await repo.replaceDetail(prId, detail);

    const { files, commits } = await repo.loadFilesAndCommits(prId);
    expect(files.map((f) => f.path)).toEqual(['b.ts']);
    expect(commits.map((c) => c.sha)).toEqual(['new-sha']);
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, prId));
    expect(pr!.body).toBe('new body');
    expect(pr!.additions).toBe(5);
    expect(pr!.deletions).toBe(2);
  });

  it('a mid-way failure (NOT NULL commit sha) rolls back — old files/commit/body stay intact (RED today: no transaction)', async () => {
    const prId = await newPrWithDetail();
    const badDetail: PrDetail = {
      number: 1,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'new-sha',
      additions: 9,
      deletions: 9,
      files_count: 1,
      status: 'open',
      body: 'should not stick',
      files: [{ path: 'new-file.ts', additions: 9, deletions: 9, patch: null }],
      // `pr_commits.sha` is NOT NULL (`db/schema/pulls.ts:52`) — null-cast to
      // force the DB constraint to reject the insert mid-way through the call.
      commits: [
        { sha: null as unknown as string, message: 'bad commit', author: 'a', committed_at: null },
      ],
    };

    await expect(repo.replaceDetail(prId, badDetail)).rejects.toThrow();

    const { files, commits } = await repo.loadFilesAndCommits(prId);
    expect(files.map((f) => f.path)).toEqual(['a.ts']);
    expect(commits.map((c) => c.sha)).toEqual(['old-sha']);
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, prId));
    expect(pr!.body).toBe('old');
  });
});
