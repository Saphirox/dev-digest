/* hooks/blast.ts — React Query hooks for the Blast Radius card (Overview tab).
   GET /pulls/:id/blast is deterministic (repo-intel index read, no model
   call), modelled on hooks/smart-diff.ts's usePrSmartDiff. GET
   /pulls/:id/prior-prs hits GitHub per expand, so it is opt-in: it only fires
   once the Prior PRs footer is open, and never silently refetches. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

/** Blast radius for a PR — deterministic, recomputed server-side on every call. */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/**
 * Prior PRs touching the same files. `enabled` requires BOTH an id and the
 * footer being open — zero requests until expanded. `staleTime: Infinity` +
 * `refetchOnWindowFocus: false` mean a re-open never spends another round of
 * GitHub calls once the first one lands (server-side cached per head_sha too).
 */
export function usePrPriorPrs(prId: string | null | undefined, open: boolean) {
  return useQuery({
    queryKey: ["pr-prior-prs", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/prior-prs`),
    enabled: !!prId && open,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
