import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionPatch,
  ConventionSkillDraft,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { CONFIG_FILES, MAX_PATTERN_LENGTH, SAMPLE_TOP_FILES } from './constants.js';
import {
  adjustConfidence,
  buildSkillDraft,
  locateSnippet,
  normalizeRule,
  renderSample,
  resolveSampledPath,
  toConventionDto,
  type SampleFile,
} from './helpers.js';
import type { ConventionsStore, ExtractorModel, NewConvention, RepoRef, RepoSource } from './ports.js';

export interface ConventionsServiceDeps {
  store: ConventionsStore;
  source: RepoSource;
  model: ExtractorModel;
}

/**
 * Conventions extractor. A scan samples the repo in code (configs + top-ranked
 * files), makes ONE cheap model call, and keeps only candidates whose evidence
 * really is in the sampled files. The user then accepts / rejects / edits them
 * and merges the accepted ones into a skill. A re-scan replaces only pending
 * candidates, so a rejected rule never comes back.
 */
export class ConventionsService {
  constructor(private deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    await this.repo(workspaceId, repoId);
    const [rows, meta] = await Promise.all([
      this.deps.store.list(workspaceId, repoId),
      this.deps.store.getScanMeta(workspaceId, repoId),
    ]);
    return {
      conventions: rows.map(toConventionDto),
      sampled_files: meta?.sampledFiles ?? null,
      last_scan_at: meta?.at.toISOString() ?? null,
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const { store, source, model } = this.deps;
    const repo = await this.repo(workspaceId, repoId);

    const files = await this.sample(repo);
    const { text, included } = renderSample(files);
    if (included.length === 0) {
      throw new ValidationError('Nothing to sample: clone and index the repo first, then re-scan.');
    }
    const contentByPath = new Map(files.map((f) => [f.path, f.content]));

    const { candidates, model: modelId, costUsd } = await model.extract(workspaceId, {
      repoName: repo.name,
      sample: text,
    });

    // Rules already decided (accepted/rejected) are never proposed again.
    const existing = await store.list(workspaceId, repoId);
    const seen = new Set(existing.filter((c) => c.status !== 'pending').map((c) => normalizeRule(c.rule)));

    const kept: NewConvention[] = [];
    let droppedUngrounded = 0;
    let droppedDuplicate = 0;
    for (const c of candidates) {
      const path = resolveSampledPath(c.evidence_path, included);
      const hit = path ? locateSnippet(contentByPath.get(path) ?? '', c.evidence_snippet, c.evidence_line) : null;
      if (!path || !hit) {
        droppedUngrounded++;
        continue;
      }
      const key = normalizeRule(c.rule);
      if (!key || seen.has(key)) {
        droppedDuplicate++;
        continue;
      }
      seen.add(key);
      const pattern = c.pattern?.trim() && c.pattern.length <= MAX_PATTERN_LENGTH ? c.pattern.trim() : null;
      // 0 means the pattern misses even the evidence file: it's wrong, so the
      // frequency is unknown rather than "seen in 0 files".
      const count = pattern ? await source.countFiles(repo, pattern) : null;
      const occurrences = count && count > 0 ? count : null;
      kept.push({
        rule: c.rule.trim(),
        category: c.category,
        rationale: c.rationale?.trim() || null,
        evidencePath: path,
        evidenceSnippet: hit.snippet,
        evidenceLine: hit.line,
        confidence: adjustConfidence(c.confidence, occurrences),
        occurrences,
        pattern,
      });
    }

    await store.replacePending(workspaceId, repoId, kept);
    await store.saveScanMeta(workspaceId, repoId, { sampledFiles: included.length, at: new Date() });
    return {
      proposed: kept.length,
      dropped_ungrounded: droppedUngrounded,
      dropped_duplicate: droppedDuplicate,
      sampled_files: included.length,
      model: modelId,
      cost_usd: costUsd,
    };
  }

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionCandidate> {
    const row = await this.deps.store.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    if (!(await this.deps.store.delete(workspaceId, id))) throw new NotFoundError('Convention not found');
  }

  /** The accepted conventions as an editable skill; saved through POST /skills. */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.repo(workspaceId, repoId);
    const accepted = (await this.deps.store.list(workspaceId, repoId))
      .filter((c) => c.status === 'accepted')
      .reverse(); // oldest first reads more naturally
    if (accepted.length === 0) throw new ValidationError('Accept at least one convention first.');
    return buildSkillDraft(repo.name, accepted);
  }

  private async repo(workspaceId: string, repoId: string): Promise<RepoRef> {
    const repo = await this.deps.store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Configs + top-ranked files, read from the clone; unreadable or empty ones skipped. */
  private async sample(repo: RepoRef): Promise<SampleFile[]> {
    const top = await this.deps.source.topFiles(repo.id, SAMPLE_TOP_FILES).catch(() => []);
    const paths = [...new Set([...CONFIG_FILES, ...top])];
    const files: SampleFile[] = [];
    for (const path of paths) {
      const content = await this.deps.source.readFile(repo, path).catch(() => '');
      if (content.trim()) files.push({ path, content });
    }
    return files;
  }
}
