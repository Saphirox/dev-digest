/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { RunTrace } from "@devdigest/shared";

/** A just-finished run's trace is saved a moment after its status flips to
    done/failed, so GET /runs/:id/trace can 404 briefly. */
const MISSING_TRACE_RETRIES = 5;
const MISSING_TRACE_RETRY_MS = 1000;

export interface RunTraceOptions {
  /** Retry a 404 (~5 times, 1 s apart) instead of failing at once. Off by
      default: historical runs without a trace should settle immediately. */
  awaitMissing?: boolean;
}

export function useRunTrace(
  runId: string | null | undefined,
  enabled = true,
  { awaitMissing = false }: RunTraceOptions = {},
) {
  return useQuery({
    queryKey: ["run-trace", runId],
    queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    retry: awaitMissing
      ? (failures, err) =>
          failures < MISSING_TRACE_RETRIES && err instanceof ApiError && err.status === 404
      : false,
    retryDelay: MISSING_TRACE_RETRY_MS,
  });
}
