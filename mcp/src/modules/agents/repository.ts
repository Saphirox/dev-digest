import { z } from 'zod';
import type { AgentsStore, AgentRecord } from './ports.js';
import { DevDigestApiClient, parseArray } from '../../adapters/devdigest-api/client.js';

/**
 * `agents` data-access layer — calls `GET /agents` for the full agent record
 * this module reads. `modules/_shared/repository.ts`'s `LookupApiRepository`
 * also calls `GET /agents`, for the resolver's narrower `AgentRef` shape
 * (id + name only) — this is not the only caller of the endpoint, just the
 * only place that parses the full `AgentRecord`.
 */

const AgentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    model: z.string(),
    enabled: z.boolean(),
  })
  .passthrough();

export class AgentsApiRepository implements AgentsStore {
  constructor(private readonly client: DevDigestApiClient) {}

  async listAgents(): Promise<AgentRecord[]> {
    const body = await this.client.get('/agents');
    return parseArray<AgentRecord>(AgentSchema, body, 'GET /agents');
  }
}
