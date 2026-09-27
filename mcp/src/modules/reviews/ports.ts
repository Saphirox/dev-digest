/**
 * `reviews` ports. What `ReviewsService` needs from the outside world,
 * declared next to the service that uses it (dependency inversion):
 * `ReviewsApiRepository` implements `ReviewsStore`; tests pass a fake.
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export type Verdict = 'request_changes' | 'approve' | 'comment';

// No `id` field: neither `helpers.ts` nor `render.ts` reads a finding's id —
// `get_findings`/`run_agent_on_pr` never return finding ids (contracts
// hygiene, 2026-09-26). The API still returns it; `repository.ts`'s
// `.passthrough()` schema lets it through unvalidated.
export interface FindingRecord {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion: string | null | undefined;
  dismissed_at: string | null;
}

export interface ReviewRecord {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  run_id: string | null;
  verdict: Verdict | null;
  score: number | null;
  created_at: string;
  findings: FindingRecord[];
}

/** `status` is `running | done | failed | cancelled` at runtime, typed as `string | null` (same nullability as the vendor contract). */
export interface RunStatusRecord {
  run_id: string;
  status: string | null;
  error: string | null;
}

export interface StartReviewRunRecord {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

export interface ReviewsStore {
  /** `POST /pulls/:id/review` with a single `agentId` (never `all:true`). */
  startReview(prId: string, agentId: string): Promise<StartReviewRunRecord[]>;
  /** `GET /pulls/:id/runs` — full run history, any status. */
  listRuns(prId: string): Promise<RunStatusRecord[]>;
  /** `GET /pulls/:id/runs/active` — in-flight runs only. */
  listActiveRuns(prId: string): Promise<RunStatusRecord[]>;
  /** `GET /pulls/:id/reviews` — persisted reviews + findings. */
  listReviews(prId: string): Promise<ReviewRecord[]>;
}
