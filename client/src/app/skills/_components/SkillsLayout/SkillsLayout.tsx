/* SkillsLayout — the Skills Lab shell, mounted once by app/skills/layout.tsx
   and kept while you move between /skills and /skills/:id: breadcrumb, the
   rail of skills, and the right pane (the page). Staying mounted keeps the
   rail's search, scroll and open drawers when you pick another skill. */
"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "../../../../components/app-shell";
import { useSkill } from "../../../../lib/hooks/skills";
import { SkillsRail } from "../SkillsRail";
import { resolveTab } from "../SkillEditor";
import { s } from "./styles";

export function SkillsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("skills");
  const skillId = useParams<{ id?: string }>()?.id;
  const tab = resolveTab(useSearchParams().get("tab"));
  const { data: skill } = useSkill(skillId);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(skillId && skill ? [{ label: skill.name }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.frame}>
        <SkillsRail activeId={skillId} tab={tab} />
        <div style={s.pane}>{children}</div>
      </div>
    </AppShell>
  );
}
