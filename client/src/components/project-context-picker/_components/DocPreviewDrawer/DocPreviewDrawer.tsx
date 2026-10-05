/* DocPreviewDrawer — one project document rendered as markdown in a side
   drawer. Read-only: opening it never changes the attached set. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Markdown, Skeleton } from "@devdigest/ui";
import { useContextFile } from "@/lib/hooks/core";
import { splitPath } from "../../helpers";
import { s } from "./styles";

export function DocPreviewDrawer({
  repoId,
  path,
  tokens,
  onClose,
}: {
  repoId: string;
  path: string;
  /** The list's token count for this document; `null` shows "—". */
  tokens: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextFile(repoId, path);
  const tokenLabel = tokens == null ? t("tokensUnknown") : t("tokens", { count: tokens });

  return (
    <Drawer
      title={<span className="mono">{splitPath(path).name}</span>}
      subtitle={`${path} · ${tokenLabel}`}
      onClose={onClose}
    >
      {isLoading && <Skeleton height={160} />}
      {isError && <p style={s.error}>{t("previewDrawer.loadError")}</p>}
      {data && (
        <div className="skill-md">
          <Markdown>{data.content ?? ""}</Markdown>
        </div>
      )}
    </Drawer>
  );
}
