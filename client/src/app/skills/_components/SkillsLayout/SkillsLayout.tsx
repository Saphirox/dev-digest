/* SkillsLayout — Skills Lab shell shared by /skills and /skills/:id: the rail
   of skills on the left, the selected skill's editor on the right. The tab
   lives in ?tab= and survives switching skills. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkill } from "../../../../lib/hooks/skills";
import { SkillsRail } from "../SkillsRail";
import { SkillEditor, TAB_KEYS } from "../SkillEditor";
import { s } from "./styles";

export function SkillsLayout({ skillId }: { skillId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("tab") ?? "";
  const tab = TAB_KEYS.includes(requested) ? requested : "config";
  const { data: skill, isLoading, isError } = useSkill(skillId);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(skill ? [{ label: skill.name }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.frame}>
        <SkillsRail activeId={skillId} tab={tab} />
        <div style={s.pane}>
          {!skillId && (
            <div style={s.center}>
              <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
            </div>
          )}
          {skillId && isLoading && (
            <div style={s.loading}>
              <Skeleton height={24} width={260} />
              <Skeleton height={220} />
            </div>
          )}
          {skillId && !isLoading && (isError || !skill) && (
            <div style={s.center}>
              <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
            </div>
          )}
          {skill && (
            <SkillEditor
              skill={skill}
              tab={tab}
              onTab={(next) => router.replace(`/skills/${skill.id}?tab=${next}`)}
              onDeleted={() => router.push("/skills")}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
