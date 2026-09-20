/* SkillEditor — one skill: header (name, type, version) and tabs. Config edits
   it; Preview renders it as the agent receives it; Stats says who uses it;
   Versions lists its body history. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge, TYPE_COLORS } from "../../../../components/skill-type-badge";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
  onDeleted,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("skills");
  const { color, bg } = TYPE_COLORS[skill.type];
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.iconBox(color, bg)}>
          <Icon.Sparkles size={14} />
        </div>
        <h1 className="mono" style={s.name}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} />
        <Badge icon="GitCommit" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        <div style={s.inner}>
          {tab === "preview" && <PreviewTab skill={skill} />}
          {tab === "stats" && <StatsTab skill={skill} />}
          {tab === "versions" && <VersionsTab skill={skill} />}
          {tab === "config" && <ConfigTab key={skill.id} skill={skill} onDeleted={onDeleted} />}
        </div>
      </div>
    </div>
  );
}
