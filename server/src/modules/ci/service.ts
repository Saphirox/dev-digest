import type {
  CiExport,
  CiExportInput,
  CiFile,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRun,
  GitHubClient,
} from '@devdigest/shared';
import { AppError, ConfigError, GitHubPermissionError, NotFoundError } from '../../platform/errors.js';
import {
  ARTIFACT_NAME,
  CI_BRANCH,
  COMMIT_MESSAGE,
  MAX_ARTIFACT_BYTES,
  PR_BODY,
  PR_TITLE,
  RUNNER_BUILD_HINT,
  RUNNER_BUNDLE_REL,
  RUNS_PER_REFRESH,
  WORKFLOW_FILE,
} from './constants.js';
import { buildFiles, buildZip, ciVerdict, parseResultArtifact, slugify } from './helpers.js';
import type {
  CiAgentRecord,
  CiAgentSource,
  CiGitHubResolver,
  CiInstallationRecord,
  CiRepoSource,
  CiRunInput,
  CiRunTrace,
  CiStore,
  RunnerBundleSource,
} from './ports.js';

export interface CiServiceDeps {
  store: CiStore;
  agents: CiAgentSource;
  repos: CiRepoSource;
  bundle: RunnerBundleSource;
  github: CiGitHubResolver;
  /** Warning sink; callers pass `err.message` only, never headers or tokens. */
  warn: (msg: string) => void;
}

export type ExportOutcome =
  | { kind: 'zip'; filename: string; data: Uint8Array }
  | { kind: 'pr'; result: CiExport };

const toRef = (repo: string): { owner: string; name: string } => {
  const [owner = '', name = ''] = repo.split('/');
  return { owner, name };
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toInstallation(r: CiInstallationRecord): CiInstallation {
  return {
    id: r.id,
    agent_id: r.agentId,
    repo: r.repo,
    target_type: r.targetType,
    installed_at: r.installedAt.toISOString(),
    agent_version: r.agentVersion,
    latest_run: r.latestRun
      ? { verdict: r.latestRun.verdict, ran_at: iso(r.latestRun.ranAt) }
      : null,
  };
}

/**
 * Export-to-CI use cases: preview/export an agent as repository files, and
 * pull CI results back from GitHub Actions artifacts. Zero LLM calls (NFR-4).
 */
export class CiService {
  constructor(private deps: CiServiceDeps) {}

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const { files } = await this.build(workspaceId, agentId, input);
    return { files };
  }

  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<ExportOutcome> {
    const { agent, files, manifest } = await this.build(workspaceId, agentId, input, input.workflow);

    if (!(await this.deps.repos.exists(workspaceId, input.repo))) {
      throw new NotFoundError('Repository not found');
    }

    if (input.action === 'files') {
      const slug = slugify(agent.name, new Set());
      return { kind: 'zip', filename: `devdigest-ci-${slug}.zip`, data: buildZip(files) };
    }

    // EC-16: one agent per repository (the runner refuses two manifests).
    const taken = await this.deps.store.findInstallationByRepo(workspaceId, input.repo);
    if (taken && taken.agentId !== agent.id) {
      throw new AppError('ci_repo_taken', `${input.repo} already runs ${taken.agentName}`, 409, {
        agent_name: taken.agentName,
      });
    }

    // GitHub is resolved once; every call below uses the same client.
    const gh = await this.resolveGithub();
    const ref = toRef(input.repo);
    const base = await gh.getDefaultBranch(ref);
    if (base === CI_BRANCH) {
      throw new AppError(
        'ci_branch_is_default',
        `The default branch of ${input.repo} is ${CI_BRANCH}; refusing to commit to it`,
        409,
      );
    }
    try {
      await gh.commitFiles(ref, {
        branch: CI_BRANCH,
        base,
        message: COMMIT_MESSAGE,
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
    } catch (err) {
      if (err instanceof GitHubPermissionError) {
        throw new AppError(
          'github_workflow_permission',
          'GitHub refused the commit. The token needs the "workflow" permission to write workflow files',
          403,
        );
      }
      throw err;
    }

    const existing = await gh.findOpenPr(ref, CI_BRANCH);
    const prUrl =
      existing?.url ??
      (await gh.openPullRequest(ref, { title: PR_TITLE, head: CI_BRANCH, base, body: PR_BODY })).url;

    // Recorded only after GitHub accepted the commit (EC-2).
    const installation = await this.deps.store.upsertInstallation(
      workspaceId,
      agent.id,
      input.repo,
      agent.version,
      manifest,
    );
    return {
      kind: 'pr',
      result: { installation: toInstallation(installation), files, pr_url: prUrl },
    };
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    if (!(await this.deps.agents.find(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    return (await this.deps.store.listInstallations(workspaceId, agentId)).map(toInstallation);
  }

  async listRuns(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.deps.store.listRuns(workspaceId);
    return rows.map((r) => ({
      id: r.id,
      repo: r.repo,
      pr_number: r.prNumber,
      agent_name: r.agentName,
      verdict: r.verdict,
      findings_count: r.findingsCount,
      cost_usd: r.costUsd,
      duration_ms: r.durationMs,
      job_url: r.githubUrl,
      ran_at: iso(r.ranAt),
    }));
  }

  /** Pull new completed runs from GitHub Actions artifacts into the CI tables. */
  async refresh(workspaceId: string): Promise<CiRefreshResult> {
    const installs = await this.deps.store.listInstallations(workspaceId);
    // One installation per repository is enforced on export; older rows are ignored.
    const byRepo = new Map<string, CiInstallationRecord>();
    for (const i of installs) if (!byRepo.has(i.repo)) byRepo.set(i.repo, i);
    if (byRepo.size === 0) return { ingested: 0, failed_repos: [] };

    let gh: GitHubClient;
    try {
      gh = await this.deps.github.resolve();
    } catch (err) {
      this.deps.warn(`ci refresh: GitHub unavailable: ${(err as Error).message}`);
      return { ingested: 0, failed_repos: [...byRepo.keys()] };
    }

    let ingested = 0;
    const failed: string[] = [];
    for (const inst of byRepo.values()) {
      try {
        ingested += await this.refreshRepo(workspaceId, gh, inst);
      } catch (err) {
        this.deps.warn(`ci refresh: ${inst.repo} failed: ${(err as Error).message}`);
        failed.push(inst.repo);
      }
    }
    return { ingested, failed_repos: failed };
  }

  private async refreshRepo(
    workspaceId: string,
    gh: GitHubClient,
    inst: CiInstallationRecord,
  ): Promise<number> {
    const ref = toRef(inst.repo);
    const runs = await gh.listWorkflowRuns(ref, WORKFLOW_FILE, RUNS_PER_REFRESH);
    let count = 0;
    for (const run of runs) {
      const stored = await this.deps.store.storedAttempt(workspaceId, run.id);
      if (stored !== null && stored >= run.attempt) continue;

      const art = await gh.downloadArtifactJson(ref, run.id, ARTIFACT_NAME, MAX_ARTIFACT_BYTES);
      const manifest = inst.manifest;
      const base = {
        installationId: inst.id,
        agentId: inst.agentId,
        repo: inst.repo,
        githubRunId: run.id,
        runAttempt: run.attempt,
        prNumber: run.pr_number,
        ranAt: run.started_at ? new Date(run.started_at) : null,
        githubUrl: run.html_url,
      };
      const trace = (runnerVersion: string | null): CiRunTrace => ({
        kind: 'ci',
        agent_version: inst.agentVersion,
        model: manifest?.model ?? 'unknown',
        runner_version: runnerVersion,
        skills: manifest?.skills ?? [],
        head_sha: run.head_sha,
        github_run_id: run.id,
        run_attempt: run.attempt,
      });

      let input: CiRunInput;
      if (art.kind === 'missing') {
        // EC-17: the job produced no artifact.
        input = {
          ...base,
          verdict: 'failed',
          agentRun: {
            status: 'failed',
            model: manifest?.model ?? 'unknown',
            costUsd: null,
            durationMs: null,
            findingsCount: null,
            error: 'The workflow run produced no devdigest-result artifact',
            trace: trace(null),
          },
        };
      } else if (art.kind === 'too_large' || art.kind === 'invalid') {
        // NFR-2 / EC-9: refused or unreadable archive, stored as a failed run with no agent run.
        input = { ...base, verdict: 'failed', agentRun: null };
      } else {
        const parsed = parseResultArtifact(art.text);
        if (!parsed.ok) {
          // EC-9: invalid result, no agent_runs row.
          input = { ...base, verdict: 'failed', agentRun: null };
        } else {
          const r = parsed.data;
          input = {
            ...base,
            prNumber: run.pr_number ?? r.pr_number ?? null,
            verdict: ciVerdict(r, manifest?.ci_fail_on ?? 'critical'),
            agentRun: {
              status: 'done',
              model: manifest?.model ?? 'unknown',
              costUsd: r.cost_usd,
              durationMs: r.duration_ms ?? null,
              findingsCount: r.findings_count,
              error: null,
              trace: trace(r.version ?? null),
            },
          };
        }
      }
      // SEC-1: one run the DB rejects (hostile artifact values) must not stop the other runs;
      // it is skipped and retried on the next refresh. GitHub errors still fail the repo (EC-15).
      try {
        await this.deps.store.saveCiRun(workspaceId, input);
        count++;
      } catch (err) {
        this.deps.warn(`ci refresh: ${inst.repo} run ${run.id} skipped: ${(err as Error).message}`);
      }
    }
    return count;
  }

  private async build(
    workspaceId: string,
    agentId: string,
    input: Pick<CiPreviewInput, 'triggers' | 'post_as'>,
    workflow?: string,
  ): Promise<{ agent: CiAgentRecord; files: CiFile[]; manifest: ReturnType<typeof buildFiles>['manifest'] }> {
    const agent = await this.deps.agents.find(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const bundle = await this.deps.bundle.read();
    if (bundle === null) {
      throw new AppError(
        'runner_bundle_missing',
        `The CI runner is not built (${RUNNER_BUNDLE_REL} is missing). Build it with: ${RUNNER_BUILD_HINT}`,
        503,
      );
    }
    const skills = await this.deps.agents.enabledSkills(agent.id);
    const { files, manifest } = buildFiles({
      agent,
      skills,
      bundle,
      triggers: input.triggers,
      postAs: input.post_as,
      workflow,
    });
    return { agent, files, manifest };
  }

  private async resolveGithub(): Promise<GitHubClient> {
    try {
      return await this.deps.github.resolve();
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(
          'github_not_configured',
          'GitHub is not configured. Add a GitHub token in Settings, or download the files as a zip',
          400,
        );
      }
      throw err;
    }
  }
}
