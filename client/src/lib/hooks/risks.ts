/* hooks/risks.ts — React Query hook for Risk Areas.
   GET the deterministic diff-grounded risk scan (no model call, recomputed on
   every read). Modelled on hooks/intent.ts's usePrIntent. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrRisks } from "@devdigest/shared";

/** Risk Areas for a PR — deterministic, recomputed server-side on every call. */
export function usePrRisks(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-risks", prId],
    queryFn: () => api.get<PrRisks>(`/pulls/${prId}/risks`),
    enabled: !!prId,
  });
}
