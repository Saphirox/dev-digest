/* hooks/ci.ts — React Query hooks for Export-to-CI (SPEC-0004): the wizard's
   preview/export calls, an agent's installations and the CI Runs page. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postBlob } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiPreview,
  CiPreviewInputBody,
  CiRefreshResult,
  CiRun,
} from "@devdigest/shared";

const installationsKey = (agentId: string | null | undefined) => ["ci-installations", agentId] as const;
const RUNS_KEY = ["ci-runs"] as const;

/** Repositories this agent is installed in (CI tab). */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: installationsKey(agentId),
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** Ingested CI runs, newest first (CI Runs page). */
export function useCiRuns() {
  return useQuery({
    queryKey: RUNS_KEY,
    queryFn: () => api.get<CiRun[]>("/ci/runs"),
  });
}

/** Generate the files the wizard lists for the chosen triggers / post-as. */
export function useCiPreview(agentId: string) {
  return useMutation({
    mutationFn: (input: CiPreviewInputBody) =>
      api.post<CiPreview>(`/agents/${agentId}/export-ci/preview`, input),
  });
}

/** Commit the files and open (or reuse) the PR (`action: 'open_pr'`). */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) => api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: installationsKey(agentId) }),
  });
}

/** The same export as a zip download (`action: 'files'`). */
export function downloadCiZip(agentId: string, input: CiExportInputBody): Promise<Blob> {
  return postBlob(`/agents/${agentId}/export-ci`, input);
}

export function useExportCiZip(agentId: string) {
  return useMutation({
    mutationFn: (input: CiExportInputBody) => downloadCiZip(agentId, input),
  });
}

/** Pull GitHub Actions results into the studio, then reload the list. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci/runs/refresh"),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUNS_KEY }),
  });
}
