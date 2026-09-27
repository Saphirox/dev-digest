import { z } from 'zod';
import type { LookupStore, RepoRecord, PullRecord, AgentRef } from './ports.js';
import { DevDigestApiClient, parseArray } from '../../adapters/devdigest-api/client.js';

/**
 * `_shared` data-access layer for PR/repo/agent resolution — the HTTP analogue
 * of a row → record mapping. Every model-supplied id it forwards is still
 * `encodeURIComponent`'d as defence in depth even though the client already
 * validated the URL is well-formed.
 */

const RepoSchema = z
  .object({
    id: z.string(),
    full_name: z.string(),
  })
  .passthrough();

const PullSchema = z
  .object({
    id: z.string().nullish(),
    number: z.number().int(),
  })
  .passthrough();

const AgentRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

export class LookupApiRepository implements LookupStore {
  constructor(private readonly client: DevDigestApiClient) {}

  async listRepos(): Promise<RepoRecord[]> {
    const body = await this.client.get('/repos');
    return parseArray<RepoRecord>(RepoSchema, body, 'GET /repos');
  }

  async listPulls(repoId: string): Promise<PullRecord[]> {
    const body = await this.client.get(`/repos/${encodeURIComponent(repoId)}/pulls`);
    return parseArray<PullRecord>(PullSchema, body, 'GET /repos/:id/pulls');
  }

  async listAgents(): Promise<AgentRef[]> {
    const body = await this.client.get('/agents');
    return parseArray<AgentRef>(AgentRefSchema, body, 'GET /agents');
  }
}
