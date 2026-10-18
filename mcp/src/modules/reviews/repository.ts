import { z } from 'zod';
import type { ReviewsStore, ReviewRecord, RunStatusRecord, StartReviewRunRecord } from './ports.js';
import { DevDigestApiClient, parseArray, parseObject } from '../../adapters/devdigest-api/client.js';

/**
 * `reviews` data-access layer — owns the response zod schemas + `safeParse`
 * for every run/review endpoint (the HTTP analogue of row → record mapping).
 */

const StartReviewRunSchema = z
  .object({
    run_id: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
  })
  .passthrough();

const StartReviewResponseSchema = z
  .object({
    runs: z.array(StartReviewRunSchema),
  })
  .passthrough();

const RunStatusSchema = z
  .object({
    run_id: z.string(),
    status: z.string().nullable(),
    error: z.string().nullable(),
  })
  .passthrough();

const FindingSchema = z
  .object({
    severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
    category: z.string(),
    title: z.string(),
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
    rationale: z.string(),
    suggestion: z.string().nullish(),
    dismissed_at: z.string().nullable(),
  })
  .passthrough();

const ReviewItemSchema = z
  .object({
    id: z.string(),
    agent_id: z.string().nullable(),
    agent_name: z.string().nullish(),
    run_id: z.string().nullable(),
    verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
    score: z.number().nullable(),
    created_at: z.string(),
    findings: z.array(FindingSchema),
  })
  .passthrough();

export class ReviewsApiRepository implements ReviewsStore {
  constructor(private readonly client: DevDigestApiClient) {}

  async startReview(prId: string, agentId: string): Promise<StartReviewRunRecord[]> {
    const body = await this.client.post(`/pulls/${encodeURIComponent(prId)}/review`, {
      agentIds: [agentId],
    });
    const parsed = parseObject<{ runs: StartReviewRunRecord[] }>(
      StartReviewResponseSchema,
      body,
      'POST /pulls/:id/review',
    );
    return parsed.runs;
  }

  async listRuns(prId: string): Promise<RunStatusRecord[]> {
    const body = await this.client.get(`/pulls/${encodeURIComponent(prId)}/runs`);
    return parseArray<RunStatusRecord>(RunStatusSchema, body, 'GET /pulls/:id/runs');
  }

  async listActiveRuns(prId: string): Promise<RunStatusRecord[]> {
    const body = await this.client.get(`/pulls/${encodeURIComponent(prId)}/runs/active`);
    return parseArray<RunStatusRecord>(RunStatusSchema, body, 'GET /pulls/:id/runs/active');
  }

  async listReviews(prId: string): Promise<ReviewRecord[]> {
    const body = await this.client.get(`/pulls/${encodeURIComponent(prId)}/reviews`);
    return parseArray<ReviewRecord>(ReviewItemSchema, body, 'GET /pulls/:id/reviews');
  }
}
