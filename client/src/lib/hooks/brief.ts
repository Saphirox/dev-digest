/* hooks/brief.ts — React Query hooks for the PR Brief (Overview tab).
   GET returns the stored brief or `null` (never makes a model call); POST is
   the button's job and makes the one `risk_brief` call. Modelled on
   hooks/intent.ts. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBrief } from "@devdigest/shared";

/** Stored PR Brief — `null` when none has been generated yet. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBrief | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or regenerate) the brief. On success the new brief replaces the
 *  cached one; on error the cached brief is left untouched so the previous
 *  brief stays on screen. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBrief>(`/pulls/${prId}/brief`),
    onSuccess: (brief) => qc.setQueryData(["pr-brief", prId], brief),
  });
}
