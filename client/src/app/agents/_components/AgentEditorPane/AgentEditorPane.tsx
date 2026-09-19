/* AgentEditorPane — /agents/:id: loads the agent and shows its editor, with
   loading and error states. The tab lives in ?tab=. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useAgent } from "../../../../lib/hooks/agents";
import { AgentEditor } from "../AgentEditor";
import { VALID_TABS } from "../AgentsLayout";
import { s } from "./styles";

export function AgentEditorPane({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const requested = useSearchParams().get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : "config";
  const { data: agent, isLoading, isError, refetch } = useAgent(agentId);

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (isError || !agent) {
    return (
      <div style={s.center}>
        <ErrorState body={t("editor.loadErrorBody")} onRetry={() => refetch()} />
      </div>
    );
  }
  return (
    <AgentEditor
      agent={agent}
      tab={tab}
      onTab={(next) => router.replace(`/agents/${agent.id}?tab=${next}`)}
      onDeleted={() => router.push("/agents")}
    />
  );
}
