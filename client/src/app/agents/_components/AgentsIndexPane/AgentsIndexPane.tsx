/* AgentsIndexPane — /agents with nothing selected: the empty state when the
   workspace has no agents (create, or start from a template), otherwise a
   prompt to pick one from the rail. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, Icon } from "@devdigest/ui";
import { useAgents } from "../../../../lib/hooks/agents";
import { useAgentsShell } from "../AgentsLayout";
import { TEMPLATES } from "../CreateAgentModal";
import { s } from "./styles";

export function AgentsIndexPane() {
  const t = useTranslations("agents");
  const { data: agents } = useAgents();
  const { openCreate } = useAgentsShell();

  if (agents === undefined) return null;
  if (agents.length > 0) {
    return (
      <div style={s.center}>
        <EmptyState icon="Cpu" title={t("list.selectPrompt.title")} body={t("list.selectPrompt.body")} />
      </div>
    );
  }
  return (
    <div style={s.center}>
      <div style={s.empty}>
        <div style={s.emptyIcon}>
          <Icon.Cpu size={24} />
        </div>
        <h2 style={s.emptyTitle}>{t("list.emptyTitle")}</h2>
        <p style={s.emptyBody}>{t("list.emptyBody")}</p>
        <div style={s.emptyActions}>
          <Button kind="primary" icon="Plus" onClick={() => openCreate()}>
            {t("list.emptyCta")}
          </Button>
          <Dropdown
            width={230}
            trigger={
              <Button kind="secondary" iconRight="ChevronDown">
                {t("list.startFromTemplate")}
              </Button>
            }
            items={TEMPLATES.map((tp) => ({
              label: t("create.templateName", { template: tp }),
              icon: "Cpu" as const,
              onClick: () => openCreate(tp),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
