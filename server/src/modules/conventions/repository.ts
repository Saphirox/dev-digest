import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { scanSettingsKey } from './constants.js';
import type {
  ConventionPatchRecord,
  ConventionRecord,
  ConventionsStore,
  NewConvention,
  RepoRef,
  ScanMeta,
} from './ports.js';

const COLUMNS = {
  id: t.conventions.id,
  rule: t.conventions.rule,
  category: t.conventions.category,
  rationale: t.conventions.rationale,
  evidencePath: t.conventions.evidencePath,
  evidenceSnippet: t.conventions.evidenceSnippet,
  evidenceLine: t.conventions.evidenceLine,
  confidence: t.conventions.confidence,
  occurrences: t.conventions.occurrences,
  status: t.conventions.status,
  createdAt: t.conventions.createdAt,
};

/**
 * Conventions data access: `conventions` rows plus each repo's last-scan
 * metadata, kept in the workspace `settings` key/value table. Every query is
 * workspace-scoped.
 */
export class ConventionsRepository implements ConventionsStore {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionRecord[]> {
    return this.db
      .select(COLUMNS)
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt), t.conventions.id);
  }

  async replacePending(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length === 0) return;
      await tx.insert(t.conventions).values(rows.map((r) => ({ ...r, workspaceId, repoId })));
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionPatchRecord,
  ): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning(COLUMNS);
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  async getScanMeta(workspaceId: string, repoId: string): Promise<ScanMeta | null> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(this.scanKeyWhere(workspaceId, repoId));
    const v = row?.value as { sampled_files?: number; at?: string } | undefined;
    if (!v?.at || typeof v.sampled_files !== 'number') return null;
    return { sampledFiles: v.sampled_files, at: new Date(v.at) };
  }

  async saveScanMeta(workspaceId: string, repoId: string, meta: ScanMeta): Promise<void> {
    const value = { sampled_files: meta.sampledFiles, at: meta.at.toISOString() };
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(t.settings)
        .set({ value })
        .where(this.scanKeyWhere(workspaceId, repoId))
        .returning({ id: t.settings.id });
      if (updated.length === 0) {
        await tx.insert(t.settings).values({ workspaceId, key: scanSettingsKey(repoId), value });
      }
    });
  }

  private scanKeyWhere(workspaceId: string, repoId: string) {
    return and(
      eq(t.settings.workspaceId, workspaceId),
      isNull(t.settings.userId),
      eq(t.settings.key, scanSettingsKey(repoId)),
    );
  }
}
