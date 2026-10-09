/* hooks/evals.ts — React Query hooks for the eval pipeline (SPEC-0003): an
   agent's eval cases, suite runs, the per-agent dashboard and the all-agents
   overview. Suite runs are async: the POST answers 202 at once, so the run
   lists poll while any run is `running` and refresh the dependent queries
   when it ends. */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  EvalCase,
  EvalCaseFromFindingInput,
  EvalCaseFromFindingResult,
  EvalCaseInput,
  EvalCaseResult,
  EvalCaseUpdate,
  EvalDashboard,
  EvalOverview,
  EvalPeriod,
  EvalRunAccepted,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from "@devdigest/shared";

/** Poll cadence while a suite run is running (NFR-7: visible within 5 s). */
export const EVAL_POLL_MS = 4000;

const casesKey = (agentId: string | null | undefined) => ["eval-cases", agentId] as const;
const runsKey = (agentId: string | null | undefined, period: EvalPeriod) =>
  ["eval-runs", agentId, period] as const;
const dashboardKey = (agentId: string | null | undefined, period: EvalPeriod) =>
  ["eval-dashboard", agentId, period] as const;

/** Everything a finished (or newly started) suite run can change for one agent. */
function invalidateAgentEvals(qc: QueryClient, agentId: string | null | undefined) {
  // Returned so a mutation stays pending until the lists have refetched — the
  // run buttons never flicker between "POST done" and "list says running".
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
    qc.invalidateQueries({ queryKey: ["eval-runs", agentId] }),
    qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] }),
    qc.invalidateQueries({ queryKey: ["eval-overview"] }),
  ]);
}

/** Calls `onEnded` on the render where `running` flips from true to false. */
function useOnRunEnded(running: boolean, onEnded: () => void) {
  const was = React.useRef(false);
  const latest = React.useRef(onEnded);
  React.useEffect(() => {
    latest.current = onEnded;
  });
  React.useEffect(() => {
    if (was.current && !running) latest.current();
    was.current = running;
  }, [running]);
}

// ---- Cases ----

export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: casesKey(agentId),
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => invalidateAgentEvals(qc, agentId),
  });
}

export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EvalCaseUpdate }) =>
      api.put<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: () => invalidateAgentEvals(qc, agentId),
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: () => invalidateAgentEvals(qc, agentId),
  });
}

/** Turn a decided finding into an eval case; the server derives the kind from the decision. The UI never sends `kind` (EC-1, revised D-4); the API still accepts it (EC-15). */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, kind }: { findingId: string } & EvalCaseFromFindingInput) =>
      api.post<EvalCaseFromFindingResult>(`/findings/${findingId}/eval-case`, kind ? { kind } : {}),
    onSuccess: (res) => invalidateAgentEvals(qc, res.case.owner_id),
  });
}

/** Synchronous single-case run (AC-34); stores a case result, never a suite run. */
export function useRunEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalCaseResult>(`/eval-cases/${caseId}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: casesKey(agentId) }),
  });
}

// ---- Suite runs ----

/** Start a suite run (202). The run lists pick it up and poll until it ends. */
export function useRunAgentEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalRunAccepted>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_d, agentId) => invalidateAgentEvals(qc, agentId),
  });
}

export type RunAllOutcome =
  | { agentId: string; status: "started" }
  | { agentId: string; status: "already_running" }
  | { agentId: string; status: "failed"; message: string };

/** "Run all agents": one POST per agent. A 409 is reported for that agent only
 *  (EC-19) and the rest still start, so it never fails as a whole. */
export function useRunAllAgentEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentIds: string[]): Promise<RunAllOutcome[]> =>
      Promise.all(
        agentIds.map(async (agentId): Promise<RunAllOutcome> => {
          try {
            await api.post<EvalRunAccepted>(`/agents/${agentId}/eval-runs`);
            return { agentId, status: "started" };
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) return { agentId, status: "already_running" };
            return { agentId, status: "failed", message: e instanceof Error ? e.message : String(e) };
          }
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ["eval-overview"] }),
  });
}

/** Suite runs of an agent in the period, newest first. Polls while one is
 *  running; when it ends, refreshes cases, dashboard and the other run lists. */
export function useAgentEvalRuns(agentId: string | null | undefined, period: EvalPeriod) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: runsKey(agentId, period),
    queryFn: () => api.get<EvalSuiteRun[]>(`/agents/${agentId}/eval-runs?period=${period}`),
    enabled: !!agentId,
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? EVAL_POLL_MS : false),
  });
  const running = (query.data ?? []).some((r) => r.status === "running");
  useOnRunEnded(running, () => invalidateAgentEvals(qc, agentId));
  return query;
}

/** One suite run with its saved effective prompt and case results (compare view). */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    // A finished run never changes.
    staleTime: 5 * 60_000,
  });
}

// ---- Dashboards ----

export function useAgentEvalDashboard(agentId: string | null | undefined, period: EvalPeriod) {
  return useQuery({
    queryKey: dashboardKey(agentId, period),
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval-dashboard?period=${period}`),
    enabled: !!agentId,
  });
}

/** All agents with eval cases + the most recent suite runs. Polls while any agent is running. */
export function useEvalOverview() {
  return useQuery({
    queryKey: ["eval-overview"],
    queryFn: () => api.get<EvalOverview>("/eval/overview"),
    refetchInterval: (q) =>
      (q.state.data?.agents ?? []).some((a) => a.latest_run?.status === "running") ? EVAL_POLL_MS : false,
  });
}
