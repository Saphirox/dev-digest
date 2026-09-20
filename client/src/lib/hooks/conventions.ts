/* hooks/conventions.ts — React Query hooks for the Conventions page: list,
   scan, accept / edit, reject (which deletes), and the skill draft built from
   accepted ones. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionPatch,
  ConventionSkillDraft,
} from "@devdigest/shared";

const key = (repoId: string | null | undefined) => ["conventions", repoId];

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Scan the repo; the list refreshes when it settles. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Accept / edit one convention. Optimistic; rolled back on error. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const previous = qc.getQueryData<ConventionList>(key(repoId));
      if (previous) {
        qc.setQueryData<ConventionList>(key(repoId), {
          ...previous,
          conventions: previous.conventions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(repoId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** Reject = delete: the card disappears at once (rolled back on error). */
export function useDeleteConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const previous = qc.getQueryData<ConventionList>(key(repoId));
      if (previous) {
        qc.setQueryData<ConventionList>(key(repoId), {
          ...previous,
          conventions: previous.conventions.filter((c) => c.id !== id),
        });
      }
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(repoId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

/** The accepted conventions merged into an editable skill (not saved yet). */
export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: () => api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`),
  });
}
