/* SkillForm — the skill's fields as the design stacks them: name, directive
   description, type, and the markdown body as a line-numbered file. Controlled;
   the create modal and the editor's Config tab own the buttons. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { BodyEditor, markdownFileName } from "../../../../components/body-editor";
import { approxTokens } from "../../../../lib/approx-tokens";
import { SKILL_TYPES } from "../../../../components/skill-type-badge";

export interface SkillFormValues {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const EMPTY_SKILL: SkillFormValues = { name: "", description: "", type: "custom", body: "" };

export function SkillForm({
  values,
  onChange,
  bodyUnsaved,
}: {
  values: SkillFormValues;
  onChange: (next: SkillFormValues) => void;
  /** The body differs from the saved version. */
  bodyUnsaved?: boolean;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillFormValues>(key: K, v: SkillFormValues[K]) =>
    onChange({ ...values, [key]: v });

  return (
    <div>
      <FormField label={t("form.nameLabel")} required>
        <TextInput
          value={values.name}
          onChange={(v) => set("name", v)}
          placeholder={t("form.namePlaceholder")}
          aria-label={t("form.nameLabel")}
        />
      </FormField>
      <FormField label={t("form.descriptionLabel")} hint={t("form.descriptionHint")}>
        <TextInput
          value={values.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
          aria-label={t("form.descriptionLabel")}
        />
      </FormField>
      <FormField label={t("form.typeLabel")}>
        <SelectInput
          value={values.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((ty) => ({ value: ty, label: t(`listItem.type.${ty}`) }))}
        />
      </FormField>
      <FormField label={t("editor.config.bodyLabel")} required>
        <BodyEditor
          value={values.body}
          onChange={(v) => set("body", v)}
          fileName={markdownFileName(values.name)}
          unsavedLabel={bodyUnsaved ? t("editor.config.unsaved") : undefined}
          tokensLabel={t("editor.config.tokens", { count: approxTokens(values.body) })}
          placeholder={t("form.bodyPlaceholder")}
          ariaLabel={t("editor.config.bodyLabel")}
        />
      </FormField>
    </div>
  );
}

/** Name and body are required; the rest can be empty. */
export function isSkillFormValid(v: SkillFormValues): boolean {
  return v.name.trim() !== "" && v.body.trim() !== "";
}
