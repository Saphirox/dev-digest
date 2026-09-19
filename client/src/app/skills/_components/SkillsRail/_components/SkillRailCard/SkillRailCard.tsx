/* SkillRailCard — one skill in the Skills rail: type-coloured icon, name, global
   switch, description, type + provenance, version, how many agents use it, and
   a Delete button (the parent confirms). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { SkillTypeBadge, TYPE_COLORS } from "../../../../../../components/skill-type-badge";
import { SOURCE_ICONS } from "./constants";
import { s } from "./styles";

export function SkillRailCard({
  skill,
  active,
  onOpen,
  onToggle,
  onDelete,
}: {
  skill: SkillSummary;
  active?: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  const { color, bg } = TYPE_COLORS[skill.type];
  const SourceIcon = Icon[SOURCE_ICONS[skill.source]];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={skill.name}
      aria-current={active ? "page" : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox(color, bg)}>
          <Icon.Sparkles size={13} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()} title={t("rail.toggle")}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
      </div>
      <div style={s.footer}>
        <Badge icon="GitCommit" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        <span>{t("rail.agents", { count: skill.used_by })}</span>
        <span style={s.spacer} />
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <IconBtn icon="Trash" size={24} danger label={t("rail.delete", { name: skill.name })} onClick={onDelete} />
        </div>
      </div>
    </div>
  );
}
