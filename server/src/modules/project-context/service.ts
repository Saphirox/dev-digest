import type { ProjectContextList, SpecFile } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_DOC_BYTES, MAX_DOC_RUN_BYTES } from './constants.js';
import {
  applyBudget,
  boundRead,
  byteCutMarker,
  docTypeFor,
  mergeContextPaths,
  type BudgetInput,
} from './helpers.js';
import type {
  CloneLocator,
  DocSource,
  ProjectContextRepo,
  ProjectContextRun,
  RepoLookup,
  TokenCounter,
} from './ports.js';

export interface ProjectContextDeps {
  docs: DocSource;
  tokens: TokenCounter;
  clones: CloneLocator;
  repos: RepoLookup;
  /** Search glob from server config (`CONTEXT_GLOB`). */
  glob: string;
}

const NOT_FOUND_MESSAGE = 'Document not found';

/**
 * Project Context: lists a repo's markdown docs from its clone, serves one for
 * preview, and assembles the documents a review run injects. No cache — the
 * clone is the source of truth on every call (AC-2).
 */
export class ProjectContextService {
  constructor(private deps: ProjectContextDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const root = this.deps.clones.rootFor(repo);
    const entries = await this.deps.docs.list(root, this.deps.glob);
    if (entries === null) return { cloned: false, files: [] };
    const files: SpecFile[] = [];
    for (const entry of entries) {
      // Above the byte cap: never read or tokenize — tokens unknown (EC-2).
      const text =
        entry.size > MAX_DOC_BYTES ? null : await this.deps.docs.read(root, entry.path, MAX_DOC_BYTES);
      files.push({
        path: entry.path,
        type: docTypeFor(entry.path),
        size: entry.size,
        tokens: text === null ? null : this.deps.tokens.count(text),
      });
    }
    return { cloned: true, files };
  }

  /** One document with its content. Only paths in the current list are served (NFR-2). */
  async readFile(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const root = this.deps.clones.rootFor(repo);
    const entries = await this.deps.docs.list(root, this.deps.glob);
    const entry = entries?.find((e) => e.path === path);
    if (!entry) throw new NotFoundError(NOT_FOUND_MESSAGE);
    // Bounded prefix (+1 byte to detect a cut); an oversized doc previews as a
    // prefix plus the truncation marker and has unknown tokens.
    const read = boundRead(await this.deps.docs.read(root, entry.path, MAX_DOC_BYTES + 1), MAX_DOC_BYTES);
    if (read.text === null) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return {
      path: entry.path,
      type: docTypeFor(entry.path),
      size: entry.size,
      tokens: read.cut ? null : this.deps.tokens.count(read.text),
      content: read.cut ? `${read.text}\n${byteCutMarker()}` : read.text,
    };
  }

  /**
   * Reads, budgets and orders the documents for a run. `undefined` when nothing
   * is attached, so the caller's prompt stays byte-identical (EC-1). Never
   * throws for a missing clone or file — those become `missing` entries.
   */
  async loadForRun(input: {
    repo: ProjectContextRepo;
    agentPaths: readonly string[];
    skillPaths: readonly (readonly string[])[];
  }): Promise<ProjectContextRun | undefined> {
    const paths = mergeContextPaths(input.agentPaths, input.skillPaths);
    if (paths.length === 0) return undefined;

    const root = this.deps.clones.rootFor(input.repo);
    const inputs: BudgetInput[] = [];
    for (const path of paths) {
      const read = boundRead(await this.deps.docs.read(root, path, MAX_DOC_RUN_BYTES + 1), MAX_DOC_RUN_BYTES);
      inputs.push({ path, text: read.text, cut: read.cut });
    }

    // Every read failing is ambiguous (no clone vs. all files gone): only then
    // probe for the clone, so the common path never walks the tree.
    const notCloned =
      inputs.every((i) => i.text === null) &&
      (await this.deps.docs.list(root, this.deps.glob)) === null;

    const budget = applyBudget(inputs, (text, max) => this.deps.tokens.truncate(text, max));
    const missing = budget.entries.filter((e) => e.status === 'missing').map((e) => e.path);
    return {
      docs: budget.docs,
      entries: budget.entries,
      // Injected docs only (included/truncated), in injection order — never
      // missing or dropped ones (AC-24); those stay visible via `entries`.
      specsRead: budget.docs.map((d) => d.path),
      specsTokens: budget.tokens,
      sha: notCloned ? null : await this.headOrNull(input.repo),
      notCloned,
      missing,
    };
  }

  private async headOrNull(repo: ProjectContextRepo): Promise<string | null> {
    try {
      return await this.deps.clones.head(repo);
    } catch {
      return null;
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ProjectContextRepo> {
    const repo = await this.deps.repos.find(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
