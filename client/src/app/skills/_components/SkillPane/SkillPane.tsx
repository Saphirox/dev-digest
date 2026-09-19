/* SkillPane — the right side of the Skills Lab: a prompt to pick a skill, or
   the selected skill's editor (loading / not found handled here). The tab
   lives in ?tab= and survives switching skills. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { useSkill } from "../../../../lib/hooks/skills";
import { SkillEditor, resolveTab } from "../SkillEditor";
import { s } from "./styles";

export function SkillPane({ skillId }: { skillId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const tab = resolveTab(useSearchParams().get("tab"));
  const { data: skill, isLoading, isError } = useSkill(skillId);

  if (!skillId) {
    return (
      <div style={s.center}>
        <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
      </div>
    );
  }
  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={260} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (isError || !skill) {
    return (
      <div style={s.center}>
        <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
      </div>
    );
  }
  return (
    <SkillEditor
      skill={skill}
      tab={tab}
      onTab={(next) => router.replace(`/skills/${skill.id}?tab=${next}`)}
      onDeleted={() => router.push("/skills")}
    />
  );
}
