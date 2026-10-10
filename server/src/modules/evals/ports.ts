import type { EvalExpectation, EvalExpectationKind, EvalSuiteRunStatus, Finding } from '@devdigest/shared';

/**
 * Evals module ports. What `EvalsService` and `EvalSuiteRunner` need from the
 * outside world, declared next to them (dependency inversion): the DB
 * (`EvalStore`), the review engine (`EvalEngine`), the agent configuration
 * (`EvalAgentSource`) and a logger (`EvalLogger`) are all passed in; tests use
 * fakes. Record types are structural subsets of the Drizzle rows, so helpers
 * and services never see a Drizzle type.
 */

// ---- records ---------------------------------------------------------------

export interface EvalCaseRecord {
  id: string;
  workspaceId: string;
  ownerKind: 'skill' | 'agent';
  ownerId: string;
  name: string;
  inputDiff: string | null;
  inputFiles: unknown;
  /** For a case made from a finding: `{ title, severity, category }`. */
  inputMeta: unknown;
  expectedOutput: unknown;
  notes: string | null;
  createdAt: Date;
  sourceFindingId: string | null;
}

export interface EvalCaseResultRecord {
  id: string;
  caseId: string | null;
  suiteRunId: string | null;
  caseName: string | null;
  expected: unknown;
  ranAt: Date;
  /** The grounded findings the agent produced. */
  actualOutput: unknown;
  pass: boolean | null;
  durationMs: number | null;
  costUsd: number | null;
  keptCount: number;
  droppedCount: number;
  expectedCount: number;
  producedCount: number;
}

/** A suite run without its (large) effective prompt. */
export interface EvalSuiteRunRecord {
  id: string;
  agentId: string;
  agentVersion: number;
  status: EvalSuiteRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  casesPassed: number | null;
  casesTotal: number;
  costUsd: number | null;
  error: string | null;
  failingCaseName: string | null;
  model: string;
  provider: string;
}

export interface EvalSuiteRunDetailRecord extends EvalSuiteRunRecord {
  effectivePrompt: string;
}

/** A suite run listed across agents, with its live agent's name. */
export interface EvalOverviewRunRecord extends EvalSuiteRunRecord {
  agentName: string;
}

/** An existing agent that has at least one eval case. */
export interface EvalOverviewAgentRecord {
  agentId: string;
  agentName: string;
  model: string;
  provider: string;
  casesTotal: number;
}

/** A finding, the review that produced it, and that review's PR. */
export interface EvalFindingSource {
  finding: {
    id: string;
    file: string;
    startLine: number;
    endLine: number;
    title: string;
    severity: string;
    category: string;
    acceptedAt: Date | null;
    dismissedAt: Date | null;
  };
  /** `reviews.agent_id` has no foreign key: null (seeded review) or a deleted agent's id. */
  review: { id: string; agentId: string | null; prId: string };
}

export interface EvalPatchRow {
  id: string;
  patch: string | null;
}

// ---- inputs ----------------------------------------------------------------

export interface NewEvalCase {
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputMeta: { title: string; severity: string; category: string } | null;
  expectedOutput: EvalExpectation;
  notes: string | null;
  sourceFindingId: string | null;
}

export interface NewSuiteRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  casesTotal: number;
  effectivePrompt: string;
  model: string;
  provider: string;
}

/** One case result to store; `suiteRunId` is null for a single-case run. */
export interface NewCaseResult {
  caseId: string;
  suiteRunId: string | null;
  workspaceId: string;
  agentId: string;
  caseName: string;
  expected: EvalExpectation;
  ranAt: Date;
  findings: Finding[];
  pass: boolean;
  durationMs: number;
  costUsd: number | null;
  keptCount: number;
  droppedCount: number;
  expectedCount: number;
  producedCount: number;
}

export interface SuiteMetrics {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  casesPassed: number;
  costUsd: number | null;
}

// ---- ports -----------------------------------------------------------------

export interface EvalStore {
  // finding → case
  /** Workspace-scoped: `undefined` when the finding does not exist in the workspace. */
  findingForEval(workspaceId: string, findingId: string): Promise<EvalFindingSource | undefined>;
  /**
   * The workspace an agent belongs to, or `undefined` when it no longer exists.
   * Deliberately unscoped: it tells a deleted agent (409) from another workspace's (404).
   */
  agentWorkspace(agentId: string): Promise<string | undefined>;
  /** Stored file rows for a PR path, ordered by id (a path may have duplicates). */
  prFilesForPath(workspaceId: string, prId: string, path: string): Promise<EvalPatchRow[]>;

  // cases (agent-owned)
  /** `null` when a case for `sourceFindingId` already exists (unique race). */
  insertCase(values: NewEvalCase): Promise<EvalCaseRecord | null>;
  getCase(workspaceId: string, id: string): Promise<EvalCaseRecord | undefined>;
  caseForFinding(workspaceId: string, findingId: string): Promise<EvalCaseRecord | undefined>;
  /** By creation time, then id: an edit never reorders the set (EC-14). */
  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]>;
  countCases(workspaceId: string, agentId: string): Promise<number>;
  updateCase(
    workspaceId: string,
    id: string,
    patch: { name?: string; expectedOutput?: EvalExpectation },
  ): Promise<EvalCaseRecord | undefined>;
  /**
   * Sets ONLY `expected_output.kind` (file and lines stay) in one statement keyed
   * on case id and workspace; `undefined` when no such case. Past `eval_runs`
   * rows hold their own snapshot and are not touched (AC-31).
   */
  setCaseKind(workspaceId: string, id: string, kind: EvalExpectationKind): Promise<EvalCaseRecord | undefined>;
  deleteCase(workspaceId: string, id: string): Promise<boolean>;
  /** The most recent stored result of each given case (suite or single run). */
  latestResults(workspaceId: string, caseIds: string[]): Promise<EvalCaseResultRecord[]>;

  // suite runs
  /** `null` when the agent already has a `running` suite run (EC-8). */
  insertSuiteRun(values: NewSuiteRun): Promise<EvalSuiteRunRecord | null>;
  runningSuiteRun(workspaceId: string, agentId: string): Promise<{ id: string } | undefined>;
  /** Writes the case results and marks the run `done` in ONE transaction. */
  finishSuiteRun(workspaceId: string, id: string, metrics: SuiteMetrics, results: NewCaseResult[]): Promise<void>;
  /** Marks the run `failed` with null metrics (EC-7). */
  failSuiteRun(
    workspaceId: string,
    id: string,
    failure: { error: string; failingCaseName: string | null },
  ): Promise<void>;
  insertCaseResult(result: NewCaseResult): Promise<EvalCaseResultRecord>;
  /** Newest first, optionally only runs started at or after `since`. */
  listSuiteRuns(workspaceId: string, agentId: string, since: Date | null): Promise<EvalSuiteRunRecord[]>;
  /** The newest `done` runs, newest first. */
  recentDoneRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalSuiteRunRecord[]>;
  getSuiteRun(workspaceId: string, id: string): Promise<EvalSuiteRunDetailRecord | undefined>;
  /** In the order the cases were reviewed. */
  caseResultsForRun(workspaceId: string, suiteRunId: string): Promise<EvalCaseResultRecord[]>;
  /** Boot reaper, deliberately unscoped: marks every `running` suite run `failed: interrupted`; returns how many. */
  reapRunning(): Promise<number>;

  // dashboard (joined to live agents: a deleted agent drops out, EC-26)
  agentsWithCases(workspaceId: string): Promise<EvalOverviewAgentRecord[]>;
  latestRun(workspaceId: string, agentId: string): Promise<EvalSuiteRunRecord | undefined>;
  recentRuns(workspaceId: string, limit: number): Promise<EvalOverviewRunRecord[]>;
}

/** The configuration an eval review starts from; read once when a run starts. */
export interface EvalAgentConfig {
  id: string;
  name: string;
  version: number;
  provider: string;
  model: string;
  strategy: string;
  systemPrompt: string;
}

export interface EvalAgentSource {
  /** Workspace-scoped: `undefined` when the agent is not in the workspace. */
  getAgent(workspaceId: string, agentId: string): Promise<EvalAgentConfig | undefined>;
  /** Enabled skills (link AND skill enabled), in link order. */
  enabledSkills(agentId: string): Promise<{ name: string; body: string }[]>;
}

/** The ONLY inputs an eval review sends (AC-10). */
export interface EvalEngineInput {
  provider: string;
  model: string;
  strategy: string;
  systemPrompt: string;
  /** Resolved skill blocks (heading + body). */
  skills: string[];
  /** The fixed task line. */
  task: string;
  /** The case's stored diff, untrusted. */
  diff: string;
}

export interface EvalEngineOutput {
  /** The findings that survived the grounding gate. */
  findings: Finding[];
  keptCount: number;
  droppedCount: number;
  /** Null when the cost of the review is unknown (EC-12). */
  costUsd: number | null;
}

/** One review of one case through the same engine as a PR review. */
export interface EvalEngine {
  review(input: EvalEngineInput): Promise<EvalEngineOutput>;
}

/** Minimal logger shape (Fastify's logger satisfies it structurally). */
export interface EvalLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** What a running suite needs, fixed when it starts (EC-10, EC-27). */
export interface SuiteSnapshot {
  runId: string;
  workspaceId: string;
  agent: EvalAgentConfig;
  skillBlocks: string[];
  cases: { id: string; name: string; inputDiff: string; expected: EvalExpectation }[];
}
