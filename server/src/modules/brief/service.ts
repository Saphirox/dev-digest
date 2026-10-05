import type { BlastRadius, PrBrief } from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { toBlastRadius } from '../blast/helpers.js';
import { extractIssueRef } from '../reviews/intent/helpers.js';
import { MAX_ERROR_CHARS } from './constants.js';
import { buildFacts, collectSpecPaths, knownFiles, missingInputs, normalizePath, validateBrief } from './helpers.js';
import { buildBriefMessages } from './prompt.js';
import type { BriefBlastIndex, BriefModel, BriefRepoRef, BriefStore, IssueSource, SpecDocsSource } from './ports.js';

/** Minimal logger shape (Fastify's request logger satisfies this structurally). */
export interface Logger {
  info: (obj: unknown, msg?: string) => void;
}

export interface BriefServiceDeps {
  store: BriefStore;
  index: BriefBlastIndex;
  issues: IssueSource;
  specs: SpecDocsSource;
  model: BriefModel;
}

/**
 * The PR Brief: ONE `risk_brief` model call over facts (no diff hunk bodies),
 * validated against the PR's and the blast map's files, stored per PR with the
 * head SHA. `get` is a pure read (no model call). `generate` collects the
 * inputs best-effort — an unavailable intent / blast radius / issue / spec is
 * listed in `missing_inputs`, never a failure — and only the model call itself
 * can fail the request, leaving the stored brief untouched.
 */
export class BriefService {
  /** Running generations, so concurrent requests for one PR share one call (EC-9). */
  private inFlight = new Map<string, Promise<PrBrief>>();

  constructor(private deps: BriefServiceDeps) {}

  /** The stored brief, or `null` when none has been generated. No model call. */
  async get(workspaceId: string, prId: string): Promise<PrBrief | null> {
    const pull = await this.deps.store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.deps.store.getBrief(workspaceId, prId);
  }

  async generate(workspaceId: string, prId: string, logger?: Logger): Promise<PrBrief> {
    const key = `${workspaceId}:${prId}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const started = this.run(workspaceId, prId, logger).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, started);
    return started;
  }

  /** Enabled agents' documents plus their enabled skills' documents (D-7), read once. */
  private async loadSpecDocs(workspaceId: string, repo: BriefRepoRef): Promise<{ path: string; content: string }[]> {
    const { specs } = this.deps;
    const agents = await specs.listEnabledAgents(workspaceId);
    const perAgentSkills = await Promise.all(agents.map((a) => specs.skillPaths(a.id)));
    return specs.loadDocs({ repo, ...collectSpecPaths(agents, perAgentSkills) });
  }

  private async run(workspaceId: string, prId: string, logger?: Logger): Promise<PrBrief> {
    const { store, index, issues, model } = this.deps;

    const pull = await store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await store.findRepo(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const files = await store.listFiles(prId);
    const intent = (await store.getIntent(prId)) ?? null;

    // Blast radius: best-effort, an unreadable index is a missing input.
    let blast: BlastRadius | null = null;
    try {
      const paths = files.map((f) => f.path);
      const [result, indexedSha] = await Promise.all([
        index.getBlastRadius(pull.repoId, paths),
        index.getIndexedSha(pull.repoId),
      ]);
      blast = toBlastRadius(result, indexedSha);
    } catch {
      blast = null;
    }

    // Linked issue: resolve the GitHub port once; ANY throw (missing token,
    // 404, network) counts as an unfetchable issue (EC-10).
    const issueRef = extractIssueRef(pull.title, pull.body);
    let issue: { number: number; title: string; body: string | null } | null = null;
    if (issueRef !== null) {
      try {
        const github = await issues.resolve();
        const meta = await github.getIssue(repo, issueRef);
        issue = { number: issueRef, title: meta.title, body: meta.body ?? null };
      } catch {
        issue = null;
      }
    }

    // Spec documents: best-effort; a missing/uncloned doc is silently omitted.
    let specDocs: { path: string; content: string }[] = [];
    try {
      specDocs = await this.loadSpecDocs(workspaceId, repo);
    } catch {
      specDocs = [];
    }

    const missing = missingInputs({ intent, blast, issueRef, issueFetched: issue !== null });
    const facts = buildFacts({
      title: pull.title,
      body: pull.body,
      intent,
      blast,
      files,
      issue,
      specs: specDocs,
      missing,
    });
    const messages = buildBriefMessages(facts);

    // The ONE model call. An AppError (e.g. the missing-key ConfigError)
    // propagates as itself; anything else is wrapped. Nothing is stored on failure.
    let result: Awaited<ReturnType<BriefModel['generate']>>;
    try {
      result = await model.generate(workspaceId, messages);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError(`Brief generation failed: ${message.slice(0, MAX_ERROR_CHARS)}`);
    }

    const prLines = new Map(files.map((f) => [normalizePath(f.path), f.changedLines ?? []]));
    const validated = validateBrief(result.data, knownFiles(files, blast), prLines);
    const brief: PrBrief = {
      ...validated,
      generated_for_sha: pull.headSha,
      generated_at: new Date().toISOString(),
      missing_inputs: missing,
      cost_usd: result.costUsd,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
    };
    await store.upsertBrief(prId, brief);

    // Counts only — never PR text, issue text, spec text or model output.
    logger?.info(
      {
        prId,
        files: files.length,
        specs: facts.specs.length,
        missing: missing.length,
        proposedRisks: result.data.risks.length,
        risks: brief.risks.length,
        proposedFocus: result.data.review_focus.length,
        focus: brief.review_focus.length,
        fileSummaries: brief.file_summaries.length,
        provider: result.provider,
        model: result.model,
      },
      'brief: generated',
    );
    return brief;
  }
}
