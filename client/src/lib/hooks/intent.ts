/* hooks/intent.ts — React Query hooks for the Intent Layer.
   GET the stored intent (or null); POST always re-derives (the button's job). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { IntentDeriveResult, PrIntentRecord } from "@devdigest/shared";

/** Stored intent for a PR — `null` when nothing has been derived yet, or
 *  `stale: true` when the PR's head moved since it was derived. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Re-derive intent (always makes a fresh classifier call — that's what the
 *  button means). Refreshes the stored intent on completion. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IntentDeriveResult>(`/pulls/${prId}/intent/derive`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pr-intent", prId] }),
  });
}
