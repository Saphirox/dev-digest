/* AgentEditor — one agent: header (name + Run Review) and tabs. Config edits
   the agent; Skills attaches, enables and orders its skills. Evals / Stats / CI
   arrive with later lessons. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { RunReviewMenu } from "./_components/RunReviewMenu";
import { SkillsTab } from "./_components/SkillsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({
  agent,
  tab,
  onTab,
  onDeleted,
}: {
  agent: Agent;
  tab: string;
  onTab: (t: string) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Cpu size={18} style={s.headerIcon} />
        <h1 style={s.name}>{agent.name}</h1>
        <div style={s.headerRight}>
          <RunReviewMenu agentId={agent.id} />
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? <SkillsTab agent={agent} /> : <ConfigTab agent={agent} onDeleted={onDeleted} />}
      </div>
    </div>
  );
}
