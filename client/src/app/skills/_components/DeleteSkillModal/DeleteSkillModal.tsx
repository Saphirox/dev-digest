/* DeleteSkillModal — confirms deleting a skill, naming how many agents lose it.
   Used by the rail card and the editor's Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "../../../../components/confirm-modal";
import { useDeleteSkill, useSkillAgents } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";

export function DeleteSkillModal({
  skill,
  onClose,
  onDeleted,
}: {
  skill: { id: string; name: string };
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const del = useDeleteSkill();
  const { data: agents } = useSkillAgents(skill.id);

  const confirm = () =>
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("preview.deleted", { name: skill.name }));
        onClose();
        onDeleted?.();
      },
    });

  return (
    <ConfirmModal
      title={t("delete.title")}
      body={t("preview.deleteConfirm", { name: skill.name, count: agents?.length ?? 0 })}
      confirmLabel={t("editor.config.delete")}
      loading={del.isPending}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
