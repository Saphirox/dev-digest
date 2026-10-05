/* ContextTab — the project documents attached to this agent, in injection
   order. A thin wrapper over the shared picker: it holds the attached paths,
   saves each change through PUT /agents/:id and shows the change at once (the
   server's answer replaces it; a failure rolls back to the saved list). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ProjectContextPicker } from "@/components/project-context-picker";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tc = useTranslations("context");
  const { repoId } = useActiveRepo();
  const update = useUpdateAgent();
  const [pending, setPending] = React.useState<string[] | null>(null);
  const value = pending ?? agent.context_paths ?? [];

  const save = (next: string[]) => {
    setPending(next);
    update.mutate({ id: agent.id, patch: { context_paths: next } }, { onSettled: () => setPending(null) });
  };

  return (
    <ProjectContextPicker
      repoId={repoId}
      value={value}
      onChange={save}
      renderHeader={({ attached, total }) => (
        <>
          <h2 style={s.title}>{t("context.title")}</h2>
          <Badge color="var(--accent)" bg="var(--accent-bg)">
            {tc("attachedOf", { attached, total })}
          </Badge>
        </>
      )}
      hint={t("context.hint")}
      footerNote={tc("footerNote")}
    />
  );
}
