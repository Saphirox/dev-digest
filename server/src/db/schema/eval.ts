import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    createdAt: now(),
    /** The finding this case was made from; null for hand-made cases and once the finding is deleted. */
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    // One case per source finding (EC-2); hand-made cases (null) are unconstrained.
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq')
      .on(t.sourceFindingId)
      .where(sql`${t.sourceFindingId} IS NOT NULL`),
    // Eval-set listing by creation time with a stable tiebreak (EC-14).
    ownerCreatedIdx: index('eval_cases_owner_created_idx').on(
      t.workspaceId,
      t.ownerKind,
      t.ownerId,
      t.createdAt,
      t.id,
    ),
  }),
);

/**
 * One execution of an agent over its whole eval set. Metrics are null while
 * running, after a failure, and when a metric has no denominator (EC-6).
 * Deleting the agent deletes its suite runs (EC-26).
 */
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    /** Agent version number at start (EC-10). */
    agentVersion: integer('agent_version').notNull(),
    status: text('status', { enum: ['running', 'done', 'failed'] })
      .notNull()
      .default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    casesPassed: integer('cases_passed'),
    casesTotal: integer('cases_total').notNull(),
    /** Null when the cost of any case review is unknown (EC-12). */
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    failingCaseName: text('failing_case_name'),
    effectivePrompt: text('effective_prompt').notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
  },
  (t) => ({
    // At most one running suite run per agent: the race guard behind EC-8.
    oneRunningUq: uniqueIndex('eval_suite_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
    agentStartedIdx: index('eval_suite_runs_agent_started_idx').on(
      t.agentId,
      t.startedAt.desc(),
      t.id,
    ),
    workspaceStartedIdx: index('eval_suite_runs_workspace_started_idx').on(
      t.workspaceId,
      t.startedAt.desc(),
    ),
    statusCk: check('eval_suite_runs_status_ck', sql`${t.status} in ('running', 'done', 'failed')`),
  }),
);

/**
 * One case result. Inside a suite run (`suiteRunId` set) or standalone (null).
 * Snapshots the case name and expectation so a later edit or delete of the case
 * leaves it intact (AC-31); `caseId` goes null when the case is deleted.
 * `actualOutput` holds the grounded findings.
 */
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'set null' }),
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    caseName: text('case_name'),
    expected: jsonb('expected'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    keptCount: integer('kept_count').notNull().default(0),
    droppedCount: integer('dropped_count').notNull().default(0),
    expectedCount: integer('expected_count').notNull().default(0),
    producedCount: integer('produced_count').notNull().default(0),
  },
  (t) => ({
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt.desc()),
    suiteRunIdx: index('eval_runs_suite_run_idx').on(t.suiteRunId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
