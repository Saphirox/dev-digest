import type { Container } from '../../platform/container.js';
import type {
  FindingActionKind,
  IntentDeriveResult,
  PrIntentRecord,
  PrRisks,
  RunEventKind,
  RunTrace,
  SmartDiff,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { IntentService } from './intent/service.js';
import { INTENT_SCHEMA_NAME, IntentSchema } from './intent/prompt.js';
import type { IntentModel, IntentSources, IntentStore } from './intent/ports.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RunLogger } from '../../platform/run-logger.js';
import { loadDiff } from './diff-loader.js';
import { deriveRisks } from './risks/index.js';
import { buildSmartDiff, ROLE_ORDER } from './smart-diff/index.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private intent: IntentService;
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.intent = new IntentService(this.buildIntentDeps(container));
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents, this.intent);
  }

  /**
   * Wire the Intent Layer's four ports to the container — this module's own
   * composition point (mirrors `conventions/routes.ts`'s `ExtractorModel`
   * wiring): the store is the existing (previously dead) `pr_intent`
   * repository methods, sources are GitHub + git, and the model resolves the
   * `review_intent` feature model like any other system LLM feature.
   */
  private buildIntentDeps(container: Container): {
    store: IntentStore;
    sources: IntentSources;
    model: IntentModel;
    tokens: { count(text: string): number };
  } {
    const store: IntentStore = {
      get: (prId) => this.repo.getIntent(prId),
      upsert: (prId, record) => this.repo.upsertIntent(prId, record),
    };
    const sources: IntentSources = {
      getIssue: async (repo, n) => (await container.github()).getIssue(repo, n),
      readFile: (repo, path) => container.git.readFile(repo, path),
    };
    const model: IntentModel = {
      classify: async (workspaceId, messages) => {
        const choice = await resolveFeatureModel(container, workspaceId, 'review_intent');
        const llm = await container.llm(choice.provider);
        const res = await llm.completeStructured({
          model: choice.model,
          schema: IntentSchema,
          schemaName: INTENT_SCHEMA_NAME,
          messages,
          temperature: 0.1,
        });
        return { data: res.data, model: res.model, provider: choice.provider, costUsd: res.costUsd };
      },
    };
    return { store, sources, model, tokens: container.tokenizer };
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }

  // ===========================================================================
  // Intent Layer
  // ===========================================================================

  /** Stored intent for a PR (`stale: true` when the PR's head moved since it
   *  was derived). `null` when nothing has been derived yet. */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.intent.get(prId, pull.headSha);
  }

  /** Always re-derives (that is what the re-derive button means) — spends
   *  money, so the route applies a tight rate limit. */
  async deriveIntent(workspaceId: string, prId: string, logger?: Logger): Promise<IntentDeriveResult> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repoRow);
    // No associated agent run — an empty runIds fan-out (no SSE target), the
    // logger still mirrors composition/result lines to stdout.
    const runLog = new RunLogger(this.container.runBus, [], logger);
    return this.intent.derive(
      workspaceId,
      { id: pull.id, number: pull.number, title: pull.title, body: pull.body, headSha: pull.headSha },
      { owner: repoRow.owner, name: repoRow.name },
      diff,
      runLog,
    );
  }

  // ===========================================================================
  // Risk Areas
  // ===========================================================================

  /** Deterministic diff-grounded risk scan — no model call, recomputed on
   *  every read (see the risk-source ADR in
   *  `docs/plans/0003-intent-card-risk-areas.md`). */
  async getRisks(workspaceId: string, prId: string, logger?: Logger): Promise<PrRisks> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repoRow);

    const risks = deriveRisks(diff);
    const addedLinesCount = diff.files.reduce((n, f) => n + f.additions, 0);

    // Counts, file counts and detector names only — never a matched line's
    // text, never a secret, never a token.
    const byKind = risks.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    }, {});
    const kindsDesc = Object.entries(byKind)
      .map(([kind, n]) => `${kind}×${n}`)
      .join(', ');
    logger?.info(
      { prId, files: diff.files.length, addedLines: addedLinesCount, risks: risks.length, byKind },
      `risks: scanned ${diff.files.length} files / ${addedLinesCount} added lines → ${risks.length} risk(s)${kindsDesc ? ` [${kindsDesc}]` : ''}`,
    );

    return {
      pr_id: pull.id,
      derived_for_sha: pull.headSha,
      risks,
      scanned: { files: diff.files.length, added_lines: addedLinesCount },
    };
  }

  // ===========================================================================
  // Smart Diff
  // ===========================================================================

  /** Reviewer-ordered diff (`core`/`tests`/`wiring`/`docs`/`boilerplate`) —
   *  deterministic, recomputed on every read, zero network I/O: only
   *  `pr_files` (already persisted) and the latest-per-agent, non-dismissed
   *  finding start lines are read. No `loadDiff`, no
   *  `PullsService.getDetail`, no adapter call. */
  async getSmartDiff(workspaceId: string, prId: string, logger?: Logger): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, findingRows] = await Promise.all([
      this.repo.getPrFiles(pull.id),
      this.repo.latestFindingRangesForPull(pull.id),
    ]);

    const smartDiff = buildSmartDiff(
      files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: f.patch })),
      findingRows,
    );

    const byRole = Object.fromEntries(smartDiff.groups.map((g) => [g.role, g.files.length]));
    const findingLines = smartDiff.groups.reduce(
      (n, g) => n + g.files.reduce((m, f) => m + f.finding_lines.length, 0),
      0,
    );
    // Counts only — never a matched line's text, never a provider/model/cost
    // field: this route makes no model call. All five roles, derived from
    // `ROLE_ORDER` so a sixth role can't silently drop out of the log line.
    const countsByRole = Object.fromEntries(ROLE_ORDER.map((role) => [role, byRole[role] ?? 0]));
    logger?.info(
      {
        prId,
        files: files.length,
        ...countsByRole,
        totalLines: smartDiff.split_suggestion.total_lines,
        findingLines,
      },
      `smart-diff: ${files.length} files → ${ROLE_ORDER.map((role) => `${role}×${countsByRole[role]}`).join(', ')}`,
    );

    return smartDiff;
  }
}
