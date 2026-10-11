import { describe, it, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';
import { GitHubPermissionError } from '../src/platform/errors.js';

const repo = { owner: 'o', name: 'r' };
const CAP = 1024 * 1024;

function clientWith(stub: unknown): OctokitGitHubClient {
  const c = new OctokitGitHubClient('test-token');
  (c as unknown as { octokit: unknown }).octokit = stub;
  return c;
}

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

const payload = {
  branch: 'devdigest/ci',
  base: 'main',
  message: 'add workflow',
  files: [{ path: '.github/workflows/devdigest.yml', contents: 'on: pull_request' }],
};

describe('OctokitGitHubClient.commitFiles', () => {
  for (const status of [403, 404, 422]) {
    it(`EC-2: HTTP ${status} from GitHub becomes GitHubPermissionError`, async () => {
      const getRef = vi.fn().mockRejectedValue(httpError(status));
      const client = clientWith({ rest: { git: { getRef } } });
      await expect(client.commitFiles(repo, payload)).rejects.toBeInstanceOf(GitHubPermissionError);
    });
  }

  it('EC-2: a non-permission status (400) is rethrown unconverted', async () => {
    const getRef = vi.fn().mockRejectedValue(httpError(400));
    const client = clientWith({ rest: { git: { getRef } } });
    const err = await client.commitFiles(repo, payload).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(GitHubPermissionError);
    expect((err as { status?: number }).status).toBe(400);
  });
});

describe('OctokitGitHubClient.downloadArtifactJson', () => {
  const NAME = 'devdigest-result';

  function stub(opts: {
    artifacts: Array<{ id: number; name: string; expired: boolean; size_in_bytes: number }>;
    zip?: Uint8Array;
  }) {
    const listWorkflowRunArtifacts = vi.fn().mockResolvedValue({ data: { artifacts: opts.artifacts } });
    const downloadArtifact = vi.fn().mockResolvedValue({
      data: opts.zip
        ? opts.zip.buffer.slice(opts.zip.byteOffset, opts.zip.byteOffset + opts.zip.byteLength)
        : new ArrayBuffer(0),
    });
    const client = clientWith({ rest: { actions: { listWorkflowRunArtifacts, downloadArtifact } } });
    return { client, downloadArtifact };
  }
  const art = (size: number) => [{ id: 7, name: NAME, expired: false, size_in_bytes: size }];

  it('NFR-2: artifact declared over 1 MB is too_large and never downloaded', async () => {
    const { client, downloadArtifact } = stub({ artifacts: art(CAP + 1) });
    expect(await client.downloadArtifactJson(repo, 1, NAME, CAP)).toEqual({ kind: 'too_large' });
    expect(downloadArtifact).not.toHaveBeenCalled();
  });

  it('NFR-2: downloaded zip bytes over the cap are too_large', async () => {
    // Stored (level 0) incompressible-ish payload so the zip itself exceeds the cap.
    const big = new Uint8Array(CAP + 100).map((_, i) => (i * 2654435761) & 0xff);
    const zip = zipSync({ 'other.bin': [big, { level: 0 }] });
    const { client, downloadArtifact } = stub({ artifacts: art(10), zip });
    expect(await client.downloadArtifactJson(repo, 1, NAME, CAP)).toEqual({ kind: 'too_large' });
    expect(downloadArtifact).toHaveBeenCalledOnce();
  });

  it('NFR-2: a result file inflating past 1 MB is too_large', async () => {
    const zip = zipSync({ [`${NAME}.json`]: strToU8(' '.repeat(CAP + 10)) });
    expect(zip.byteLength).toBeLessThan(CAP);
    const { client } = stub({ artifacts: art(zip.byteLength), zip });
    expect(await client.downloadArtifactJson(repo, 1, NAME, CAP)).toEqual({ kind: 'too_large' });
  });

  it('NFR-2: a small valid zip returns ok with the JSON text', async () => {
    const text = JSON.stringify({ findings: [] });
    const zip = zipSync({ [`${NAME}.json`]: strToU8(text) });
    const { client } = stub({ artifacts: art(zip.byteLength), zip });
    expect(await client.downloadArtifactJson(repo, 1, NAME, CAP)).toEqual({ kind: 'ok', text });
  });

  it('SEC-1: a corrupt artifact archive is invalid, not a thrown error', async () => {
    const junk = new Uint8Array([1, 2, 3]);
    const { client } = stub({ artifacts: art(junk.byteLength), zip: junk });
    await expect(client.downloadArtifactJson(repo, 1, NAME, CAP)).resolves.toEqual({ kind: 'invalid' });
  });

  it('NFR-2: no matching artifact is missing and nothing is downloaded', async () => {
    const { client, downloadArtifact } = stub({ artifacts: [] });
    expect(await client.downloadArtifactJson(repo, 1, NAME, CAP)).toEqual({ kind: 'missing' });
    expect(downloadArtifact).not.toHaveBeenCalled();
  });
});

describe('OctokitGitHubClient.listWorkflowRuns', () => {
  const wr = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    run_attempt: 1,
    head_sha: `sha${id}`,
    html_url: `https://github.com/o/r/actions/runs/${id}`,
    pull_requests: [{ number: 10 + id }],
    run_started_at: '2026-10-02T10:00:00Z',
    created_at: '2026-10-02T10:00:00Z',
    conclusion: 'success',
    head_repository: { full_name: 'o/r' },
    ...over,
  });

  it('SEC-2: skipped and fork runs are dropped before the limit is applied', async () => {
    const listWorkflowRuns = vi.fn().mockResolvedValue({
      data: {
        workflow_runs: [
          wr(1, { conclusion: 'skipped' }),
          wr(2, { head_repository: { full_name: 'attacker/r' } }),
          wr(3),
          wr(4, { conclusion: 'failure' }),
          wr(5),
          wr(6, { head_repository: null }),
        ],
      },
    });
    const client = clientWith({ rest: { actions: { listWorkflowRuns } } });
    const runs = await client.listWorkflowRuns(repo, 'devdigest-review.yml', 2);
    expect(runs.map((r) => r.id)).toEqual([3, 4]);
    const all = await client.listWorkflowRuns(repo, 'devdigest-review.yml', 20);
    expect(all.map((r) => r.id)).toEqual([3, 4, 5]); // a deleted head repo (null) fails closed
    expect(listWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({ per_page: 100 }));
  });
});
