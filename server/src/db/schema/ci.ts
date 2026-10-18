import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { workspaces } from './core';
import { agentRuns } from './runs';

export const ciInstallations = pgTable('ci_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  repo: text('repo').notNull(),
  targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  /** Agent version number at export time; NULL for rows that predate the column. */
  agentVersion: integer('agent_version'),
  /** The exported `AgentManifest`, so ingest knows `ci_fail_on`/model/skills without the live agent. */
  manifest: jsonb('manifest'),
});

// Nullable `workspace_id`/`repo`/`github_run_id`: the shared dev volume may hold
// rows written by other branches before these columns existed.
export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    repo: text('repo'),
    githubRunId: bigint('github_run_id', { mode: 'number' }),
    runAttempt: integer('run_attempt'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    /** The run's `CiVerdict` (passed | changes_requested | failed). */
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({
    wsRunUq: uniqueIndex('ci_runs_workspace_github_run_uq').on(t.workspaceId, t.githubRunId),
    wsRanAtIdx: index('ci_runs_workspace_ran_at_idx').on(t.workspaceId, t.ranAt.desc()),
  }),
);
