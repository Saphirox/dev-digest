import { z } from 'zod';
import type { ConventionsStore, ConventionListRecord } from './ports.js';
import { DevDigestApiClient, parseObject } from '../../adapters/devdigest-api/client.js';

/** `conventions` data-access layer — the only place that calls `GET /repos/:id/conventions`. */

const ConventionItemSchema = z
  .object({
    rule: z.string(),
    category: z.string(),
    status: z.string(),
    evidence_path: z.string(),
    evidence_line: z.number().int().nullish(),
  })
  .passthrough();

const ConventionListSchema = z
  .object({
    conventions: z.array(ConventionItemSchema),
    last_scan_at: z.string().nullable(),
  })
  .passthrough();

export class ConventionsApiRepository implements ConventionsStore {
  constructor(private readonly client: DevDigestApiClient) {}

  async listConventions(repoId: string): Promise<ConventionListRecord> {
    const body = await this.client.get(`/repos/${encodeURIComponent(repoId)}/conventions`);
    return parseObject<ConventionListRecord>(ConventionListSchema, body, 'GET /repos/:id/conventions');
  }
}
