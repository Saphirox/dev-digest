import { z } from 'zod';
import type { BlastStore, BlastRadiusRecord } from './ports.js';
import { DevDigestApiClient, parseObject } from '../../adapters/devdigest-api/client.js';

/** `blast` data-access layer — owns the response zod schema + `safeParse` for `GET /pulls/:id/blast`. */

const ChangedSymbolSchema = z
  .object({
    name: z.string(),
    file: z.string(),
    kind: z.string(),
  })
  .passthrough();

const BlastCallerSchema = z
  .object({
    name: z.string(),
    file: z.string(),
    line: z.number().int(),
  })
  .passthrough();

const DownstreamImpactSchema = z
  .object({
    symbol: z.string(),
    file: z.string().optional(),
    callers: z.array(BlastCallerSchema),
    endpoints_affected: z.array(z.string()),
    crons_affected: z.array(z.string()),
    rank: z.number().optional(),
  })
  .passthrough();

const BlastRadiusSchema = z
  .object({
    changed_symbols: z.array(ChangedSymbolSchema),
    downstream: z.array(DownstreamImpactSchema),
    summary: z.string().nullable(),
    degraded: z.boolean().optional(),
    reason: z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']).optional(),
    indexed_sha: z.string().nullable().optional(),
  })
  .passthrough();

export class BlastApiRepository implements BlastStore {
  constructor(private readonly client: DevDigestApiClient) {}

  async getBlastRadius(prId: string): Promise<BlastRadiusRecord> {
    const body = await this.client.get(`/pulls/${encodeURIComponent(prId)}/blast`);
    return parseObject<BlastRadiusRecord>(BlastRadiusSchema, body, 'GET /pulls/:id/blast');
  }
}
