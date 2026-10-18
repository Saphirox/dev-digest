import { stringify } from 'yaml';
import { zipSync, strToU8 } from 'fflate';
import { AgentManifest, CiResultArtifact } from '@devdigest/shared';
import type { CiFile, CiTrigger, CiVerdict } from '@devdigest/shared';
import {
  AGENTS_DIR,
  RUNNER_DIR,
  SKILLS_DIR,
  WORKFLOW_PATH,
} from './constants.js';
import type { CiAgentRecord, CiSkillRecord, RunnerBundleFile } from './ports.js';

/**
 * Lower-case `[a-z0-9-]` slug, de-duplicated against `taken` with `-2`, `-3`…
 * Slugs become file names, so path safety rests on this alphabet.
 */
export function slugify(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/** AC-19: openai/anthropic ids become OpenRouter ids; openrouter ids are kept. */
export function toManifest(agent: CiAgentRecord, skillSlugs: string[]): AgentManifest {
  const viaOpenRouter = agent.provider !== 'openrouter';
  return AgentManifest.parse({
    name: agent.name,
    provider: 'openrouter',
    model: viaOpenRouter ? `${agent.provider}/${agent.model}` : agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  });
}

export function manifestYaml(manifest: AgentManifest): string {
  return stringify(manifest);
}

const TRIGGER_ORDER: CiTrigger[] = ['opened', 'synchronize', 'reopened'];

/**
 * The workflow is a fixed template: only enum values (triggers, post-as) are
 * substituted, never agent text.
 */
export function buildWorkflow(
  triggers: CiTrigger[],
  postAs: 'github_review' | 'pr_comment' | 'none',
): string {
  const types = TRIGGER_ORDER.filter((t) => triggers.includes(t)).join(', ');
  return `name: DevDigest review

on:
  pull_request:
    types: [${types}]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    # Skip pull requests from forks: they get no secrets and a read-only token.
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run DevDigest review
        run: node .devdigest/runner/index.js
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: \${{ github.repository }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_POST_AS: ${postAs}
      - name: Upload result
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: devdigest-result
          path: devdigest-result.json
          if-no-files-found: ignore
`;
}

export interface BuildFilesInput {
  agent: CiAgentRecord;
  skills: CiSkillRecord[];
  bundle: RunnerBundleFile[];
  triggers: CiTrigger[];
  postAs: 'github_review' | 'pr_comment' | 'none';
  /** The user's edited workflow; replaces the generated one when set. */
  workflow?: string;
}

/** The files to write, plus the manifest they contain. Only the workflow is editable. */
export function buildFiles(input: BuildFilesInput): { files: CiFile[]; manifest: AgentManifest } {
  const taken = new Set<string>();
  const skillFiles = input.skills.map((s) => ({ slug: slugify(s.name, taken), body: s.body }));
  const manifest = toManifest(
    input.agent,
    skillFiles.map((s) => s.slug),
  );
  const agentSlug = slugify(input.agent.name, new Set());
  const files: CiFile[] = [
    { path: `${AGENTS_DIR}/${agentSlug}.yaml`, contents: manifestYaml(manifest), editable: false },
    ...skillFiles.map((s) => ({
      path: `${SKILLS_DIR}/${s.slug}.md`,
      contents: s.body,
      editable: false,
    })),
    ...input.bundle.map((f) => ({
      path: `${RUNNER_DIR}/${f.path}`,
      contents: f.contents,
      editable: false,
    })),
    {
      path: WORKFLOW_PATH,
      contents: input.workflow ?? buildWorkflow(input.triggers, input.postAs),
      editable: true,
    },
  ];
  return { files, manifest };
}

export function buildZip(files: CiFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.contents);
  return zipSync(entries);
}

/** Guarded JSON.parse + `CiResultArtifact` check of an untrusted artifact (AC-29). */
export function parseResultArtifact(
  text: string,
): { ok: true; data: CiResultArtifact } | { ok: false } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const parsed = CiResultArtifact.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
}

/** AC-31: does the run's findings meet the agent's `ci_fail_on` threshold? */
export function ciVerdict(
  counts: { findings_count: number; critical?: number | null; warning?: number | null },
  ciFailOn: string,
): Extract<CiVerdict, 'passed' | 'changes_requested'> {
  const critical = counts.critical ?? 0;
  const warning = counts.warning ?? 0;
  let blocks = false;
  if (ciFailOn === 'critical') blocks = critical > 0;
  else if (ciFailOn === 'warning') blocks = critical + warning > 0;
  else if (ciFailOn === 'any') blocks = counts.findings_count > 0;
  return blocks ? 'changes_requested' : 'passed';
}

export function isGithubUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://github.com/');
}
