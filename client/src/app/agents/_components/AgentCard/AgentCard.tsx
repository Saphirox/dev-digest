/* AgentCard — one agent in the Agents rail: icon, name, enabled switch,
   description, model chip, linked-skill count and a Delete button (the parent
   confirms). Run stats arrive with the Agent Performance lesson. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { modelColor, shortModel } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
  onDelete,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("agents");
  const color = modelColor(ag.model);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ag.name}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={s.card(!!active, ag.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)} title={ag.model}>
          {shortModel(ag.model)}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
        {onDelete && (
          <div style={s.delete} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <IconBtn icon="Trash" size={24} danger label={t("card.delete", { name: ag.name })} onClick={onDelete} />
          </div>
        )}
      </div>
    </div>
  );
}
