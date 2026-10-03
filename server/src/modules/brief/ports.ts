import type { ChatMessage, IssueMeta, PrBrief } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';
import type { BriefModelOutput } from './output.js';

/**
 * Brief module ports. What `BriefService` needs from the outside world,
 * declared next to it (dependency inversion): the DB (`BriefStore`), the
 * repo-intel facade (`BriefBlastIndex`), GitHub (`IssueSource`), Project
 * Context (`SpecDocsSource`) and the `risk_brief` model (`BriefModel`) are all
 * passed in; tests use fakes.
 */

export interface BriefPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
}

export interface BriefRepoRef {
  id: string;
  owner: string;
  name: string;
}

/** A changed file's stats. Deliberately has NO `patch` (NFR-1). */
/** An inclusive range of new-side line numbers a diff hunk touches. */
export interface LineRange {
  start: number;
  end: number;
}

export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  /** New-side line ranges of the file's hunks — numbers only, never diff text.
   *  Absent or empty when the patch is unavailable. */
  changedLines?: LineRange[];
}

/** The stored intent, narrowed to what the brief's facts use. */
export interface BriefIntent {
  intent: string;
  inScope: string[];
  outOfScope: string[];
}

export interface BriefStore {
  /** Workspace-scoped PR lookup (tenancy guard). */
  findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  /** Workspace-scoped repo lookup (tenancy guard). */
  findRepo(workspaceId: string, repoId: string): Promise<BriefRepoRef | undefined>;
  /** Path + add/delete counts only — never the patch text. */
  listFiles(prId: string): Promise<BriefFile[]>;
  getIntent(prId: string): Promise<BriefIntent | undefined>;
  /** The stored brief; `null` when none exists or the stored JSON no longer parses. */
  getBrief(workspaceId: string, prId: string): Promise<PrBrief | null>;
  upsertBrief(prId: string, brief: PrBrief): Promise<void>;
}

/** The repo-intel facade, narrowed to what the brief reads. */
export interface BriefBlastIndex {
  getBlastRadius(repoId: string, files: string[]): Promise<BlastResult>;
  /** The index's `lastIndexedSha`, or `null` when the repo has no index row. */
  getIndexedSha(repoId: string): Promise<string | null>;
}

/** A narrowed slice of `GitHubClient` (satisfied structurally). */
export interface IssueClient {
  getIssue(repo: { owner: string; name: string }, n: number): Promise<IssueMeta>;
}

/**
 * Resolves the GitHub port. `generate` calls `resolve()` at most ONCE, only
 * when the PR references an issue — a missing token throws the container's own
 * `ConfigError` here, which the brief counts as an unfetchable issue (EC-10).
 */
export interface IssueSource {
  resolve(): Promise<IssueClient>;
}

/**
 * Spec documents attached to the workspace's enabled agents and their skills.
 * Three thin calls over the container; which paths to merge is
 * `BriefService`'s decision (`collectSpecPaths`).
 */
export interface SpecDocsSource {
  /** The workspace's enabled agents, with their own attached document paths. */
  listEnabledAgents(workspaceId: string): Promise<{ id: string; contextPaths: string[] }[]>;
  /** One agent's enabled skills' attached document paths, one list per skill. */
  skillPaths(agentId: string): Promise<string[][]>;
  /** Reads the documents once under Project Context's own caps. */
  loadDocs(input: {
    repo: BriefRepoRef;
    agentPaths: string[];
    skillPaths: string[][];
  }): Promise<{ path: string; content: string }[]>;
}

export interface BriefModel {
  generate(
    workspaceId: string,
    messages: ChatMessage[],
  ): Promise<{
    data: BriefModelOutput;
    model: string;
    provider: string;
    costUsd: number | null;
    tokensIn: number;
    tokensOut: number;
  }>;
}
