/* ConfirmModal — asks before an irreversible action (delete). Confirm runs it;
   Cancel, the ✕ and the backdrop close without doing anything. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  loading,
  onConfirm,
  onClose,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" kind="secondary" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" kind="danger" icon="Trash" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p style={{ padding: "18px 24px", margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
        {body}
      </p>
    </Modal>
  );
}
