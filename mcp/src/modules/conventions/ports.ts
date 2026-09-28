/**
 * `conventions` ports. What `ConventionsService` needs from the outside
 * world, declared next to the service that uses it (dependency inversion):
 * `ConventionsApiRepository` implements `ConventionsStore`; tests pass a fake.
 */

export interface ConventionRecord {
  rule: string;
  category: string;
  status: string;
  evidence_path: string;
  evidence_line: number | null | undefined;
}

// No `sampled_files` field: `service.ts`'s `getConventions` never reads it
// (contracts hygiene, 2026-09-26). The API still returns it;
// `repository.ts`'s `.passthrough()` schema lets it through unvalidated.
export interface ConventionListRecord {
  conventions: ConventionRecord[];
  last_scan_at: string | null;
}

export interface ConventionsStore {
  /** `GET /repos/:id/conventions` — all statuses. */
  listConventions(repoId: string): Promise<ConventionListRecord>;
}
