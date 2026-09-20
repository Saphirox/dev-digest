/* ConfigTab — edit a skill: name, directive description, type and body. The
   Enabled switch saves at once and doesn't bump the version; Save does when
   the text changed. Imported skills carry the trust notice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { DeleteSkillModal } from "../../../DeleteSkillModal";
import { SkillForm, isSkillFormValid, type SkillFormValues } from "../../../SkillForm";
import { isImported } from "../../helpers";
import { isDirty, toFormValues } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill, onDeleted }: { skill: Skill; onDeleted: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [deleting, setDeleting] = React.useState(false);
  const [values, setValues] = React.useState<SkillFormValues>(() => toFormValues(skill));
  const [showError, setShowError] = React.useState(false);

  const dirty = isDirty(values, skill);
  const valid = isSkillFormValid(values);

  const save = () => {
    if (!valid) {
      setShowError(true);
      return;
    }
    const patch = { ...values, name: values.name.trim(), description: values.description.trim() };
    update.mutate(
      { id: skill.id, patch },
      {
        onSuccess: (saved) => {
          setValues(toFormValues(saved));
          toast.success(t("form.saved", { version: saved.version }));
        },
      },
    );
  };

  return (
    <div>
      {deleting && <DeleteSkillModal skill={skill} onClose={() => setDeleting(false)} onDeleted={onDeleted} />}
      <div style={s.header}>
        <h2 style={s.title}>{t("editor.config.title")}</h2>
        <Badge icon="GitCommit" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        <label style={s.enabled}>
          {t("editor.config.enabled")}
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} />
        </label>
      </div>

      {isImported(skill) && <div style={s.notice}>{t("preview.untrustedNotice")}</div>}

      <SkillForm values={values} onChange={setValues} bodyUnsaved={values.body !== skill.body} />

      <div style={s.actions}>
        <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!dirty} loading={update.isPending}>
          {t("editor.config.save")}
        </Button>
        <Button kind="secondary" size="sm" onClick={() => setValues(toFormValues(skill))} disabled={!dirty}>
          {t("editor.config.cancel")}
        </Button>
        {showError && !valid && <span style={s.error}>{t("form.required")}</span>}
        <span style={s.spacer} />
        <Button kind="danger" size="sm" icon="Trash" onClick={() => setDeleting(true)}>
          {t("editor.config.delete")}
        </Button>
      </div>
    </div>
  );
}
