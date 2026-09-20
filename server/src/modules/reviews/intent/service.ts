import type { IntentDeriveResult, IntentSource, PrIntentRecord, RepoRef, UnifiedDiff } from '@devdigest/shared';
import type { RunLogger } from '../../../platform/run-logger.js';
import { MAX_BODY_CHARS, MAX_DOC_CHARS, MAX_FILES } from './constants.js';
import { clampConfidence, extractDocLinks, extractIssueRef, hunkHeaders } from './helpers.js';
import { buildMessages, type BuildMessagesDoc, type BuildMessagesFile, type BuildMessagesIssue } from './prompt.js';
import type { IntentModel, IntentSources, IntentStore, IntentUpsertInput, Tokens } from './ports.js';

export interface IntentServiceDeps {
  store: IntentStore;
  sources: IntentSources;
  model: IntentModel;
  tokens: Tokens;
}

/** The subset of a PR row the service needs (kept narrow so unit tests can
 *  fake it without a Drizzle row). */
export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
}

/**
 * The Intent Layer's core: derive `{intent, in_scope[], out_of_scope[]}` from
 * PR title/body + linked issue + linked repo docs + the changed-file list
 * (hunk headers only, never diff body), and persist it per PR with freshness,
 * provenance (`sources`) and `missing_context`. Depends only on its four
 * ports — no Drizzle, GitHub, or git import here.
 */
export class IntentService {
  constructor(private deps: IntentServiceDeps) {}

  /** Stored intent for a PR, with `stale` recomputed against the PR's current
   *  `headSha`. `null` when nothing has been derived yet. */
  async get(prId: string, headSha: string): Promise<PrIntentRecord | null> {
    const record = await this.deps.store.get(prId);
    if (!record) return null;
    return { ...record, stale: record.derived_for_sha !== headSha };
  }

  /**
   * Derive a fresh intent (always re-derives; the caller decides whether a
   * stored one is fresh enough via `get`/`ensureFresh`). Collects evidence
   * best-effort — an unreachable issue/doc/link is recorded in `sources` +
   * `missing_context`, never invented — then makes ONE classifier call and
   * persists the result.
   */
  async derive(
    workspaceId: string,
    pull: IntentPull,
    repo: RepoRef,
    diff: UnifiedDiff,
    log: RunLogger,
  ): Promise<IntentDeriveResult> {
    const sources: IntentSource[] = [
      { kind: 'pr_title_body', ref: `PR #${pull.number}`, ok: true, note: null },
    ];
    const missingRefs: string[] = [];
    let anyUnreachable = false;

    const noteMissing = (ref: string) => {
      missingRefs.push(ref);
      log.info(`intent: missing context — ${ref} (not retrievable)`);
    };

    // ---- linked issue ------------------------------------------------------
    let issueForPrompt: BuildMessagesIssue | null = null;
    const issueNum = extractIssueRef(pull.title, pull.body);
    if (issueNum != null) {
      const ref = `#${issueNum}`;
      try {
        const issue = await this.deps.sources.getIssue(repo, issueNum);
        sources.push({ kind: 'linked_issue', ref, ok: true, note: null });
        issueForPrompt = { number: issueNum, title: issue.title, body: issue.body ?? null };
      } catch {
        anyUnreachable = true;
        sources.push({ kind: 'linked_issue', ref, ok: false, note: 'not reachable' });
        noteMissing(ref);
      }
    }

    // ---- linked repo docs / external links ---------------------------------
    const docsForPrompt: BuildMessagesDoc[] = [];
    for (const link of extractDocLinks(pull.body)) {
      if (link.kind === 'external_link') {
        anyUnreachable = true;
        sources.push({ kind: 'external_link', ref: link.ref, ok: false, note: 'external link not fetched' });
        noteMissing(link.ref);
        continue;
      }
      try {
        const content = await this.deps.sources.readFile(repo, link.ref);
        if (!content) throw new Error('file is empty');
        sources.push({ kind: 'repo_file', ref: link.ref, ok: true, note: null });
        docsForPrompt.push({ path: link.ref, content: content.slice(0, MAX_DOC_CHARS) });
      } catch {
        // Never surface the raw error message here: for an ENOENT it embeds
        // the absolute host filesystem path (`open '/Users/<user>/…'`),
        // disclosed to the client via GET /pulls/:id/intent.
        anyUnreachable = true;
        sources.push({ kind: 'repo_file', ref: link.ref, ok: false, note: 'not reachable' });
        noteMissing(link.ref);
      }
    }

    // ---- changed files: paths + add/delete counts + hunk HEADERS only -----
    const headersByFile = hunkHeaders(diff.raw);
    const filesForPrompt: BuildMessagesFile[] = diff.files.slice(0, MAX_FILES).map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      headers: headersByFile.find((h) => h.path === f.path)?.headers ?? [],
    }));

    const bodyForPrompt = pull.body ? pull.body.slice(0, MAX_BODY_CHARS) : null;
    const messages = buildMessages({
      title: pull.title,
      body: bodyForPrompt,
      issue: issueForPrompt,
      docs: docsForPrompt,
      missingRefs,
      files: filesForPrompt,
    });

    const hunkCount = filesForPrompt.reduce((n, f) => n + f.headers.length, 0);
    const sectionsDesc = [
      'pr-title-body',
      ...(issueForPrompt ? [`linked-issue#${issueForPrompt.number}`] : []),
      ...docsForPrompt.map((d) => `repo-file:${d.path}`),
      `file-list(${filesForPrompt.length} files, ${hunkCount} hunk headers)`,
    ].join(', ');
    const tokens = this.deps.tokens.count(messages.map((m) => m.content).join('\n'));

    const result = await this.deps.model.classify(workspaceId, messages);

    // Composed AFTER the call resolves (the model port only reveals the
    // resolved provider/model in its result), but describes exactly what was
    // sent — sections, exclusion of diff bodies, token estimate, chosen model.
    log.info(
      `intent prompt: sections=[${sectionsDesc}]; diff bodies excluded; ~${tokens} tokens; model=${result.provider}/${result.model}`,
    );

    const hasBody = !!bodyForPrompt && bodyForPrompt.trim().length > 0;
    const hasIssueOrDoc = issueForPrompt != null || docsForPrompt.length > 0;
    const clamped = clampConfidence(result.data.confidence, { hasBody, anyUnreachable, hasIssueOrDoc });
    const clampNote = clamped < result.data.confidence ? ` (model ${result.data.confidence}, clamped)` : '';

    const missingContext = Array.from(new Set([...missingRefs, ...result.data.missing_context]));

    const upsertInput: IntentUpsertInput = {
      intent: result.data.summary,
      inScope: result.data.in_scope,
      outOfScope: result.data.out_of_scope,
      confidence: clamped,
      derivedForSha: pull.headSha,
      sources,
      missingContext,
      provider: result.provider,
      model: result.model,
    };
    await this.deps.store.upsert(pull.id, upsertInput);

    log.result(
      `intent: in_scope=${result.data.in_scope.length}, out_of_scope=${result.data.out_of_scope.length}, confidence=${clamped}${clampNote}`,
    );

    const record: PrIntentRecord = {
      pr_id: pull.id,
      intent: result.data.summary,
      in_scope: result.data.in_scope,
      out_of_scope: result.data.out_of_scope,
      confidence: clamped,
      derived_for_sha: pull.headSha,
      derived_at: new Date().toISOString(),
      stale: false,
      sources,
      missing_context: missingContext,
      provider: result.provider,
      model: result.model,
    };

    return { intent: record, cost_usd: result.costUsd, model: result.model, provider: result.provider };
  }

  /**
   * Reuse a fresh stored intent, else derive one. The review must NEVER fail
   * because the classifier failed: every error is caught here, logged, and
   * resolved as `undefined` — never re-thrown.
   */
  async ensureFresh(
    workspaceId: string,
    pull: IntentPull,
    repo: RepoRef,
    diff: UnifiedDiff,
    log: RunLogger,
  ): Promise<PrIntentRecord | undefined> {
    try {
      const existing = await this.get(pull.id, pull.headSha);
      if (existing && !existing.stale) {
        log.info(`intent: reusing stored intent (sha ${pull.headSha.slice(0, 7)})`);
        return existing;
      }
      const result = await this.derive(workspaceId, pull, repo, diff, log);
      return result.intent;
    } catch (err) {
      log.info(`intent: derivation failed — ${(err as Error).message}; continuing without intent`);
      return undefined;
    }
  }
}
