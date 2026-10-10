# repo-conventions

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## react-query-mutations-invalidate-or-update-the-c
React Query mutations invalidate or update the cache with specific query keys (e.g., `["agents"]` for list, `["agent", id]` for detail) to keep the UI in sync.

Detected in `client/src/lib/hooks/agents.ts:34`:

```
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}
```