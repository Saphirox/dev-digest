/* hooks/smart-diff.ts — React Query hook for the Smart Diff (reviewer-ordered
   diff). GET the deterministic classification + summary (no model call,
   recomputed on every read). Modelled on hooks/risks.ts's usePrRisks. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

/** Smart Diff for a PR — deterministic, recomputed server-side on every call. */
export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
