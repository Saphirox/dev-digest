import type { CiVerdict, AgentManifest, GitHubClient } from '@devdigest/shared';

/**
 * ci module ports. What `CiService` needs from the outside world, declared next
 * to it: the CI tables (`CiStore`), the agent and repo lookups, the runner
 * bundle, and GitHub. Tests pass fakes.
 */

export interface CiAgentRecord {
  id: string;
  name: string;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string;
  ciFailOn: string;
  version: number;
}

export interface CiSkillRecord {
  name: string;
  body: string;
}

/** Workspace-scoped agent lookup (built from `container.agentsRepo`). */
export interface CiAgentSource {
  find(workspaceId: string, agentId: string): Promise<CiAgentRecord | undefined>;
  /** Skills enabled on the agent (link AND skill enabled), in order. */
  enabledSkills(agentId: string): Promise<CiSkillRecord[]>;
}

/** Workspace-scoped repo lookup (built from `container.reposRepo`). */
export interface CiRepoSource {
  exists(workspaceId: string, fullName: string): Promise<boolean>;
}

/** One file of the runner build; `path` is posix, relative to `agent-runner/dist/`. */
export interface RunnerBundleFile {
  path: string;
  contents: string;
}

/**
 * Every file of the built runner (`agent-runner/dist/`: `index.js`, its ncc
 * chunks, `package.json`); null when `index.js` is missing, i.e. not built.
 */
export interface RunnerBundleSource {
  read(): Promise<RunnerBundleFile[] | null>;
}

/** GitHub is resolved ONCE per use case, before any loop. */
export interface CiGitHubResolver {
  resolve(): Promise<GitHubClient>;
}

export interface CiInstallationRecord {
  id: string;
  agentId: string;
  agentName: string;
  repo: string;
  targetType: 'gha' | 'circle' | 'jenkins' | 'cli';
  installedAt: Date;
  agentVersion: number | null;
  /** The exported manifest; null for rows that predate the column. */
  manifest: AgentManifest | null;
  latestRun: { verdict: CiVerdict; ranAt: Date | null } | null;
}

/** What gets recorded in `run_traces` for an ingested CI run (AC-28). */
export interface CiRunTrace {
  kind: 'ci';
  agent_version: number | null;
  model: string;
  runner_version: string | null;
  skills: string[];
  head_sha: string;
  github_run_id: number;
  run_attempt: number;
}

/** The `agent_runs` side of an ingested run; absent for an invalid result (EC-9). */
export interface CiAgentRunInput {
  status: 'done' | 'failed';
  model: string;
  costUsd: number | null;
  durationMs: number | null;
  findingsCount: number | null;
  error: string | null;
  trace: CiRunTrace;
}

export interface CiRunInput {
  installationId: string;
  agentId: string;
  repo: string;
  githubRunId: number;
  runAttempt: number;
  prNumber: number | null;
  ranAt: Date | null;
  githubUrl: string;
  verdict: CiVerdict;
  agentRun: CiAgentRunInput | null;
}

/** One `ci_runs` row joined for the CI Runs page. */
export interface CiRunRecord {
  id: string;
  repo: string | null;
  prNumber: number | null;
  agentName: string | null;
  verdict: CiVerdict;
  findingsCount: number | null;
  costUsd: number | null;
  durationMs: number | null;
  githubUrl: string | null;
  ranAt: Date | null;
}

export interface CiStore {
  /** The installation of `repo` (any agent), joined with the agent name. */
  findInstallationByRepo(workspaceId: string, repo: string): Promise<CiInstallationRecord | undefined>;
  /** Workspace-scoped: the agent must belong to `workspaceId`. */
  upsertInstallation(
    workspaceId: string,
    agentId: string,
    repo: string,
    agentVersion: number,
    manifest: AgentManifest,
  ): Promise<CiInstallationRecord>;
  listInstallations(workspaceId: string, agentId?: string): Promise<CiInstallationRecord[]>;
  /** Stored attempt of a GitHub run, or null when it was never ingested. */
  storedAttempt(workspaceId: string, githubRunId: number): Promise<number | null>;
  saveCiRun(workspaceId: string, input: CiRunInput): Promise<void>;
  listRuns(workspaceId: string): Promise<CiRunRecord[]>;
}
