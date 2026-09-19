import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, vector, index, integer, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  category: text('category', {
    enum: ['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'],
  })
    .notNull()
    .default('general'),
  rationale: text('rationale'),
  /** 1-based first line of `evidence_snippet` in `evidence_path` (verified in code). */
  evidenceLine: integer('evidence_line'),
  /** Literal/regex the model says identifies the convention; drives the frequency check. */
  pattern: text('pattern'),
  /** Files matching `pattern` at scan time ("seen in N files"); null when not counted. */
  occurrences: integer('occurrences'),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
  createdAt: now(),
}, (t) => ({
  repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt.desc()),
  categoryCk: check(
    'conventions_category_ck',
    sql`${t.category} in ('naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general')`,
  ),
  statusCk: check('conventions_status_ck', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
  evidenceLineCk: check('conventions_evidence_line_ck', sql`${t.evidenceLine} >= 1`),
  occurrencesCk: check('conventions_occurrences_ck', sql`${t.occurrences} >= 0`),
}));
