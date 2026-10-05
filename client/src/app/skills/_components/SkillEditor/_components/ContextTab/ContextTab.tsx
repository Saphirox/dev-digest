/* ContextTab — the project documents attached to this skill, in injection
   order; any agent using the skill inherits them. A thin wrapper over the shared
   picker: it holds the attached paths, saves each change through PUT /skills/:id
   and shows the change at once (the server's answer replaces it; a failure rolls
   back to the saved list). Below the list, a display-only "SERIALIZES AS" box
   shows how the attached paths read. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ProjectContextPicker } from "@/components/project-context-picker";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";
import { serializeAs } from "./helpers";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const update = useUpdateSkill();
  const [pending, setPending] = React.useState<string[] | null>(null);
  const value = pending ?? skill.context_paths ?? [];

  const save = (next: string[]) => {
    setPending(next);
    update.mutate({ id: skill.id, patch: { context_paths: next } }, { onSettled: () => setPending(null) });
  };

  return (
    <div>
      <ProjectContextPicker
        repoId={repoId}
        value={value}
        onChange={save}
        previewIconOnly
        renderHeader={({ attached }) => (
          <>
            <h2 style={s.title}>{t("context.title")}</h2>
            <Badge color="var(--accent)" bg="var(--accent-bg)">
              {t("context.attachedCount", { count: attached })}
            </Badge>
          </>
        )}
        hint={t("context.inherit")}
      />
      <div style={s.serializes}>
        <div style={s.serializesLabel}>{t("context.serializesAs")}</div>
        <pre className="mono" style={s.serializesBox} data-testid="serializes-as">
          {serializeAs(value)}
        </pre>
      </div>
    </div>
  );
}
