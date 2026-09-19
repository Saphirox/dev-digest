/* AgentsLayout — the Agents section shell, mounted once by app/agents/layout.tsx
   and kept while you move between /agents and /agents/:id: breadcrumb, the
   rail of agents, the create modal, and the right pane (the page). Staying
   mounted is what keeps the rail's order fixed until a reload. */
"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "../../../../components/app-shell";
import { useAgent, useAgents } from "../../../../lib/hooks/agents";
import { AgentsRail } from "../AgentsRail";
import { CreateAgentModal, type AgentTemplate } from "../CreateAgentModal";
import { resolveTab } from "../AgentEditor";
import { AgentsShellContext } from "./context";
import { s } from "./styles";

export function AgentsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("agents");
  const params = useParams<{ id?: string }>();
  const agentId = params?.id;
  const tab = resolveTab(useSearchParams().get("tab"));
  const agents = useAgents();
  const { data: agent } = useAgent(agentId);
  // `undefined` = closed; `null` = open, from scratch; a template = prefilled.
  const [creating, setCreating] = React.useState<AgentTemplate | null | undefined>(undefined);
  const shell = React.useMemo(() => ({ openCreate: (tp?: AgentTemplate) => setCreating(tp ?? null) }), []);

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    ...(agentId && agent ? [{ label: agent.name }] : []),
  ];

  return (
    <AgentsShellContext.Provider value={shell}>
      <AppShell crumb={crumb}>
        {creating !== undefined && (
          <CreateAgentModal onClose={() => setCreating(undefined)} template={creating ?? undefined} />
        )}
        <div style={s.frame}>
          <AgentsRail
            agents={agents.data}
            isLoading={agents.isLoading}
            isError={agents.isError}
            onRetry={() => agents.refetch()}
            activeId={agentId}
            tab={tab}
            onCreate={shell.openCreate}
          />
          <div style={s.pane}>{children}</div>
        </div>
      </AppShell>
    </AgentsShellContext.Provider>
  );
}
