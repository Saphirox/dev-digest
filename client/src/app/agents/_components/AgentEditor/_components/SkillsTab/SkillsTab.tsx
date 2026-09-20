/* SkillsTab — every workspace skill, in this agent's prompt order. Ticking a
   skill enables it for the agent and appends it to the prompt; only enabled
   skills can be dragged (or moved with ↑/↓ on the handle), and earlier ones
   appear earlier in the assembled prompt. Each change saves the
   whole ordered set (optimistic; rolled back on error). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, AgentSkillDetail } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../lib/hooks/skills";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { buildRows, countEnabled, filterRows, moveTo, setLinkEnabled, toEntries } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: linked, isLoading: linksLoading } = useAgentSkills(agent.id);
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const save = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const rows = buildRows(linked ?? [], allSkills ?? []);
  const visible = filterRows(rows, filter);

  const commit = (next: AgentSkillDetail[]) => {
    if (next === rows) return;
    save.mutate({ skills: toEntries(next), optimistic: next });
  };

  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      commit(moveTo(rows, dragId, rows.findIndex((r) => r.id === targetId)));
    }
    setDragId(null);
    setOverId(null);
  };

  if (linksLoading || skillsLoading) return <Skeleton height={220} />;

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {rows.length === 0 && <p style={s.empty}>{t("skills.empty")}</p>}
      {rows.length > 0 && visible.length === 0 && <p style={s.empty}>{t("skills.noMatch")}</p>}

      <ol style={s.list} aria-label={t("skills.title")}>
        {visible.map((row) => {
          const index = rows.findIndex((r) => r.id === row.id);
          return (
            <li
              key={row.id}
              data-testid={`skill-row-${row.name}`}
              draggable={row.link_enabled}
              onDragStart={(e) => {
                setDragId(row.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                // Only the enabled block accepts a drop.
                if (!dragId || !row.link_enabled) return;
                e.preventDefault();
                setOverId(row.id);
              }}
              onDragLeave={() => setOverId((cur) => (cur === row.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(row.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              style={s.row(overId === row.id && dragId !== row.id, row.link_enabled)}
            >
              <button
                type="button"
                style={s.handle(row.link_enabled)}
                disabled={!row.link_enabled}
                aria-label={t("skills.moveHint", { name: row.name })}
                title={row.link_enabled ? t("skills.dragHandle") : t("skills.dragDisabled")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    commit(moveTo(rows, row.id, index + (e.key === "ArrowUp" ? -1 : 1)));
                  }
                }}
              >
                <Icon.Menu size={15} />
              </button>
              <Checkbox
                checked={row.link_enabled}
                onChange={(v) => commit(setLinkEnabled(rows, row.id, v))}
                label={
                  <span className="mono" style={s.name(!row.enabled)}>
                    {row.name}
                  </span>
                }
              />
              {!row.enabled && <span style={s.offHint}>{t("skills.globallyOff")}</span>}
              <span style={s.spacer} />
              <SkillTypeBadge type={row.type} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
