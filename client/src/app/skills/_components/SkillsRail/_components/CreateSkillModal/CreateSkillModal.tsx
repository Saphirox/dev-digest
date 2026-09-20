/* CreateSkillModal — "Add Skill → Create skill": the skill fields in a modal.
   On success the new skill opens in the editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { EMPTY_SKILL, SkillForm, isSkillFormValid, type SkillFormValues } from "../../../SkillForm";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [values, setValues] = React.useState<SkillFormValues>(EMPTY_SKILL);
  const [showError, setShowError] = React.useState(false);
  const valid = isSkillFormValid(values);

  const submit = () => {
    if (!valid) {
      setShowError(true);
      return;
    }
    create.mutate(
      { ...values, name: values.name.trim(), description: values.description.trim() },
      {
        onSuccess: (skill) => {
          toast.success(t("form.created", { name: skill.name }));
          onCreated(skill.id);
        },
      },
    );
  };

  return (
    <Modal
      width={720}
      title={t("form.createTitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {showError && !valid && <span style={s.error}>{t("form.required")}</span>}
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button kind="primary" size="sm" icon="Check" onClick={submit} loading={create.isPending}>
            {t("form.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillForm values={values} onChange={setValues} />
      </div>
    </Modal>
  );
}
