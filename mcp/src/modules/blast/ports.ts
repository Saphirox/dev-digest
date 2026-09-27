/**
 * `blast` ports. What `BlastService` needs from the outside world, declared
 * next to the service that uses it (dependency inversion): `BlastApiRepository`
 * implements `BlastStore`; tests pass a fake.
 *
 * No `@devdigest/shared` import (mcp standing rule) — these shapes are
 * hand-typed to match the server's `BlastRadius` wire contract
 * (`server/src/vendor/shared/contracts/brief.ts`, plan 0011 Step 1) field for
 * field, validated with `safeParse` in `repository.ts` at the HTTP boundary.
 */

export interface ChangedSymbolRecord {
  name: string;
  file: string;
  kind: string;
}

export interface BlastCallerRecord {
  name: string;
  file: string;
  line: number;
}

/** Mirrors the server's `BlastDegradedReason` enum (plan 0011 Step 1). */
export type BlastDegradedReason = 'flag_off' | 'index_failed' | 'index_partial' | 'repo_too_large' | 'no_data';

export interface DownstreamImpactRecord {
  symbol: string;
  /** The symbol's own declaring file, when known. */
  file?: string;
  callers: BlastCallerRecord[];
  endpoints_affected: string[];
  crons_affected: string[];
  /** Highest caller rank for this symbol, for sort/emphasis. */
  rank?: number;
}

export interface BlastRadiusRecord {
  changed_symbols: ChangedSymbolRecord[];
  downstream: DownstreamImpactRecord[];
  summary: string | null;
  /** True when this specific call fell back to a non-persistent path. */
  degraded?: boolean;
  reason?: BlastDegradedReason;
  /** The repo-intel index's `lastIndexedSha` at the time of this read. */
  indexed_sha?: string | null;
}

export interface BlastStore {
  /** `GET /pulls/:id/blast` — the precomputed repo-intel blast-radius map. */
  getBlastRadius(prId: string): Promise<BlastRadiusRecord>;
}
