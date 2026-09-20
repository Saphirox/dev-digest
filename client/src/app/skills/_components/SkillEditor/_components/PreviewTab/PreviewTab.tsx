/* PreviewTab — the skill body rendered as the reviewing agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div>
      <h2 style={s.title}>{t("editor.preview.title")}</h2>
      <p style={s.hint}>{t("editor.preview.hint")}</p>
      <div className="skill-md" style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
