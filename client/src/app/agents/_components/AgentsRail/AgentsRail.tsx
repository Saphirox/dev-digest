/* AgentsRail — the left column of the Agents section: "Add Agent" (from
   scratch or a template), search, and a card per agent, enabled ones first.
   The order is fixed for the page load, so toggling never moves a card.
   Selecting a card opens it in the editor, keeping the current tab. With no agents it shows only its
   title; the layout's empty state carries the create actions. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useUpdateAgent } from "../../../../lib/hooks/agents";
import { AgentCard } from "../AgentCard";
import { DeleteAgentModal } from "../DeleteAgentModal";
import { TEMPLATES, type AgentTemplate } from "../CreateAgentModal";
import { applyOrder, filterAgents, railOrder } from "./helpers";
import { s } from "./styles";

export function AgentsRail({
  agents,
  isLoading,
  isError,
  onRetry,
  activeId,
  tab,
  onCreate,
}: {
  agents: Agent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  activeId?: string;
  tab: string;
  /** Open the create modal, optionally prefilled from a template. */
  onCreate: (template?: AgentTemplate) => void;
}) {
  const t = useTranslations("agents");
  const router = useRouter();
  const update = useUpdateAgent();
  const [search, setSearch] = React.useState("");
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);
  // Sorted once, when the agents first arrive (enabled first); later refetches,
  // e.g. after a toggle, keep this order. A page reload sorts again.
  const [order, setOrder] = React.useState<string[] | null>(null);
  if (order === null && agents) setOrder(railOrder(agents));
  const list = filterAgents(applyOrder(agents ?? [], order), search);
  // No agents: the rail is just its title; the empty state carries the CTAs.
  const hasAgents = (agents?.length ?? 0) > 0;

  return (
    <aside style={s.rail}>
      {deleting && (
        <DeleteAgentModal
          agent={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (deleting.id === activeId) router.push("/agents");
          }}
        />
      )}
      <div style={s.top}>
        <div style={s.titleRow}>
          <h1 style={s.title}>{t("list.title")}</h1>
          {hasAgents && (
            <Dropdown
              width={230}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("list.addAgent")}
                </Button>
              }
              items={[
                { label: t("list.createFromScratch"), icon: "Edit", onClick: () => onCreate() },
                { divider: true },
                ...TEMPLATES.map((tp) => ({
                  label: t("create.templateName", { template: tp }),
                  icon: "Cpu" as const,
                  muted: true,
                  onClick: () => onCreate(tp),
                })),
              ]}
            />
          )}
        </div>
        {hasAgents && (
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
        )}
      </div>

      <div style={s.list}>
        {isLoading && <Skeleton height={110} />}
        {isError && <ErrorState body={t("list.loadError")} onRetry={onRetry} />}
        {agents && agents.length > 0 && list.length === 0 && <p style={s.muted}>{t("list.noMatch")}</p>}
        {list.map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            skillCount={a.skill_count}
            onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
            onDelete={() => setDeleting({ id: a.id, name: a.name })}
          />
        ))}
      </div>
    </aside>
  );
}
