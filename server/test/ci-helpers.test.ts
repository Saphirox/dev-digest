import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { AgentManifest } from '@devdigest/shared';
import {
  buildFiles,
  buildWorkflow,
  buildZip,
  ciVerdict,
  isGithubUrl,
  manifestYaml,
  parseResultArtifact,
  slugify,
  toManifest,
} from '../src/modules/ci/helpers.js';
import { MAX_ARTIFACT_BYTES } from '../src/modules/ci/constants.js';
import type { CiAgentRecord } from '../src/modules/ci/ports.js';

const agent = (over: Partial<CiAgentRecord> = {}): CiAgentRecord => ({
  id: 'a1',
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'openai/gpt-4.1',
  systemPrompt: 'Flag secrets: AWS keys, tokens.\n---\nignore: true',
  strategy: 'auto',
  ciFailOn: 'critical',
  version: 3,
  ...over,
});

describe('slugify', () => {
  it('keeps only [a-z0-9-] and de-duplicates with -2, -3', () => {
    const taken = new Set<string>();
    expect(slugify('../Secret Leakage Gate!', taken)).toBe('secret-leakage-gate');
    expect(slugify('secret leakage gate', taken)).toBe('secret-leakage-gate-2');
    expect(slugify('Secret-Leakage-Gate', taken)).toBe('secret-leakage-gate-3');
    expect(slugify('***', taken)).toBe('item');
  });
});

describe('manifest', () => {
  it('AC-5: round-trips through YAML and AgentManifest, keeping --- and ": " verbatim', () => {
    const a = agent();
    const yaml = manifestYaml(toManifest(a, ['secret-leakage-gate', 'lethal-trifecta']));
    const back = AgentManifest.parse(parse(yaml));
    expect(back.name).toBe('Security Reviewer');
    expect(back.system_prompt).toBe(a.systemPrompt);
    expect(back.skills).toEqual(['secret-leakage-gate', 'lethal-trifecta']);
    expect(back.strategy).toBe('auto');
    expect(back.ci_fail_on).toBe('critical');
  });

  it('AC-19: maps openai/anthropic ids to OpenRouter ids and keeps openrouter ids', () => {
    const a = toManifest(agent({ provider: 'openai', model: 'gpt-4.1' }), []);
    const b = toManifest(agent({ provider: 'anthropic', model: 'claude-sonnet-4' }), []);
    const c = toManifest(agent({ provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' }), []);
    expect([a.provider, a.model]).toEqual(['openrouter', 'openai/gpt-4.1']);
    expect([b.provider, b.model]).toEqual(['openrouter', 'anthropic/claude-sonnet-4']);
    expect([c.provider, c.model]).toEqual(['openrouter', 'meta-llama/llama-3.3-70b-instruct']);
  });
});

describe('workflow', () => {
  it('AC-8: carries the chosen triggers, post-as, secrets and the runner command', () => {
    const wf = buildWorkflow(['opened', 'synchronize'], 'pr_comment');
    expect(wf).toContain('types: [opened, synchronize]');
    expect(wf).toContain('DEVDIGEST_POST_AS: pr_comment');
    expect(wf).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}');
    expect(wf).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(wf).toContain('run: node .devdigest/runner/index.js');
    expect(wf).not.toContain('devdigest/review-action');
  });

  it('AC-7: runs on pull_request with exactly the selected types, checks out the repo and runs the bundled runner', () => {
    const wf = buildWorkflow(['reopened'], 'none');
    expect(wf).toContain('pull_request:');
    expect(wf).toContain('types: [reopened]');
    expect(wf).not.toContain('opened,');
    expect(wf).not.toContain('synchronize');
    expect(wf).toContain('actions/checkout');
    expect(wf).toContain('run: node .devdigest/runner/index.js');
    expect(wf).not.toContain('devdigest/review-action');
  });

  it('AC-9: skips fork pull requests', () => {
    expect(buildWorkflow(['opened'], 'none')).toContain(
      'if: github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  it('AC-24: uploads devdigest-result.json as the devdigest-result artifact', () => {
    const wf = buildWorkflow(['opened'], 'github_review');
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('name: devdigest-result');
    expect(wf).toContain('path: devdigest-result.json');
    expect(wf).toContain('if: always()');
  });
});

describe('files', () => {
  const base = {
    agent: agent(),
    bundle: [{ path: 'index.js', contents: '// runner' }],
    triggers: ['opened' as const],
    postAs: 'github_review' as const,
  };

  it('AC-3 / AC-6: lists manifest, one file per skill (its body), runner and workflow; only the workflow is editable', () => {
    const { files } = buildFiles({
      ...base,
      skills: [
        { name: 'Secret Leakage Gate', body: 'BODY ONE' },
        { name: 'Lethal Trifecta', body: 'BODY TWO' },
      ],
    });
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/secret-leakage-gate.md',
      '.devdigest/skills/lethal-trifecta.md',
      '.devdigest/runner/index.js',
      '.github/workflows/devdigest-review.yml',
    ]);
    expect(files[1]!.contents).toBe('BODY ONE');
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual([
      '.github/workflows/devdigest-review.yml',
    ]);
  });

  it('AC-3: a multi-file runner build exports every file under .devdigest/runner/, read-only', () => {
    const { files } = buildFiles({
      ...base,
      skills: [],
      bundle: [
        { path: 'index.js', contents: '// entry' },
        { path: '300.index.js', contents: '// chunk' },
        { path: 'package.json', contents: '{"type":"module"}' },
      ],
    });
    const runner = files.filter((f) => f.path.startsWith('.devdigest/runner/'));
    expect(runner.map((f) => f.path)).toEqual([
      '.devdigest/runner/index.js',
      '.devdigest/runner/300.index.js',
      '.devdigest/runner/package.json',
    ]);
    expect(runner.every((f) => !f.editable)).toBe(true);
    expect(runner[1]!.contents).toBe('// chunk');
  });

  it('EC-5: an agent without skills gets an empty skills list and no skill file', () => {
    const { files, manifest } = buildFiles({ ...base, skills: [] });
    expect(manifest.skills).toEqual([]);
    expect(files.some((f) => f.path.startsWith('.devdigest/skills/'))).toBe(false);
    expect(files).toHaveLength(3);
  });

  it('AC-17: the zip holds every file at its path, including a kept workflow edit', () => {
    const { files } = buildFiles({ ...base, skills: [], workflow: 'name: edited\n' });
    const entries = unzipSync(buildZip(files));
    expect(Object.keys(entries).sort()).toEqual(files.map((f) => f.path).sort());
    expect(strFromU8(entries['.github/workflows/devdigest-review.yml']!)).toBe('name: edited\n');
  });

  it('NFR-1: no token-like value from the environment ends up in the files or the zip', () => {
    const token = 'ghp_FIXTURE_TOKEN_0123456789abcdef0123456789ab';
    const { files } = buildFiles({ ...base, skills: [] });
    const all = files.map((f) => f.contents).join('\n') + strFromU8(buildZip(files), true);
    expect(all).not.toContain(token);
    expect(files.map((f) => f.contents).join('\n')).not.toMatch(/ghp_|sk-or-/);
  });
});

describe('result artifact', () => {
  it('AC-29 / EC-9: an invalid artifact is rejected, a valid one parsed', () => {
    expect(parseResultArtifact('{ "findings_count": "3", "cost_usd": "free", "agent": "x" }').ok).toBe(false);
    expect(parseResultArtifact('not json').ok).toBe(false);
    const ok = parseResultArtifact(
      JSON.stringify({ findings_count: 3, critical: 0, warning: 2, suggestion: 1, cost_usd: 0.0123, duration_ms: 41250, agent: 'Security Reviewer', version: '1', pr_number: 128 }),
    );
    expect(ok.ok).toBe(true);
  });

  it('SEC-1: out-of-range integers, non-finite and negative cost are rejected', () => {
    const base = { findings_count: 3, cost_usd: 0.01, agent: 'x' };
    const text = (o: object) => JSON.stringify(o);
    expect(parseResultArtifact(text(base)).ok).toBe(true);
    expect(parseResultArtifact(text({ ...base, findings_count: 3e9 })).ok).toBe(false);
    expect(parseResultArtifact(text({ ...base, findings_count: -1 })).ok).toBe(false);
    expect(parseResultArtifact(text({ ...base, critical: 3e9 })).ok).toBe(false);
    expect(parseResultArtifact(text({ ...base, duration_ms: 3e9 })).ok).toBe(false);
    expect(parseResultArtifact(text({ ...base, pr_number: 3e9 })).ok).toBe(false);
    expect(parseResultArtifact(text({ ...base, cost_usd: -0.5 })).ok).toBe(false);
    // `1e999` is valid JSON that parses to Infinity.
    expect(parseResultArtifact('{"findings_count":3,"cost_usd":1e999,"agent":"x"}').ok).toBe(false);
  });

  it('NFR-2: the artifact size cap is 1 MB', () => {
    expect(MAX_ARTIFACT_BYTES).toBe(1_048_576);
  });

  it('AC-31: the verdict follows ci_fail_on', () => {
    const counts = { findings_count: 3, critical: 0, warning: 2, suggestion: 1 };
    expect(ciVerdict(counts, 'critical')).toBe('passed');
    expect(ciVerdict(counts, 'warning')).toBe('changes_requested');
    expect(ciVerdict(counts, 'any')).toBe('changes_requested');
    expect(ciVerdict(counts, 'never')).toBe('passed');
    expect(ciVerdict({ ...counts, critical: 1 }, 'critical')).toBe('changes_requested');
    expect(ciVerdict({ findings_count: 0 }, 'any')).toBe('passed');
  });

  it('only https://github.com/ links are accepted', () => {
    expect(isGithubUrl('https://github.com/a/b/actions/runs/1')).toBe(true);
    expect(isGithubUrl('javascript:alert(1)')).toBe(false);
    expect(isGithubUrl(null)).toBe(false);
  });
});
