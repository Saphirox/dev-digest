/* DeleteAgentModal — confirms deleting an agent (its versions and skill links go
   with it; past runs keep their history). Used by the rail card and the
   editor's Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "../../../../components/confirm-modal";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { useToast } from "../../../../lib/toast";

export function DeleteAgentModal({
  agent,
  onClose,
  onDeleted,
}: {
  agent: { id: string; name: string };
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const del = useDeleteAgent();

  const confirm = () =>
    del.mutate(agent.id, {
      onSuccess: () => {
        toast.success(t("delete.done", { name: agent.name }));
        onClose();
        onDeleted?.();
      },
    });

  return (
    <ConfirmModal
      title={t("delete.title")}
      body={t("config.deleteConfirm", { name: agent.name })}
      confirmLabel={t("config.delete")}
      loading={del.isPending}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
