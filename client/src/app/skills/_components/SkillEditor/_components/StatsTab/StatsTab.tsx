/* StatsTab — only what has a source: the agents that use this skill. Pull and
   accept rates need findings attributed back to skills, which nothing records
   yet, so they show "—" and say why. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: agents, isLoading } = useSkillAgents(skill.id);

  return (
    <div>
      <div style={s.tiles}>
        <div style={s.tile}>
          <div style={s.label}>{t("editor.stats.usedByTitle")}</div>
          <div style={s.value}>{isLoading ? "…" : t("rail.agents", { count: agents?.length ?? 0 })}</div>
        </div>
        <div style={s.tile}>
          <div style={s.label}>{t("editor.stats.pullRate")}</div>
          <div style={s.value}>—</div>
        </div>
        <div style={s.tile}>
          <div style={s.label}>{t("editor.stats.acceptRate")}</div>
          <div style={s.value}>—</div>
        </div>
      </div>
      <p style={s.note}>{t("editor.stats.notTracked")}</p>

      <h2 style={s.title}>{t("editor.stats.usedByTitle")}</h2>
      <p style={s.note}>{t("editor.stats.usedByHint")}</p>
      {isLoading && <Skeleton height={60} />}
      {agents && agents.length === 0 && <p style={s.note}>{t("editor.stats.noAgents")}</p>}
      {agents && agents.length > 0 && (
        <ul style={s.list}>
          {agents.map((a) => (
            <li key={a.id} style={s.row}>
              <Icon.Cpu size={14} style={s.rowIcon} />
              <Link href={`/agents/${a.id}?tab=skills`} style={s.link}>
                {a.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
