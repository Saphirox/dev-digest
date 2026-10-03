"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { refTarget } from "../../helpers";
import { FileRefLink } from "../FileRefLink";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  prPaths: ReadonlySet<string>;
  /** Files the PR adds (see `isNewFile`). */
  newFiles?: ReadonlySet<string>;
  repoFullName: string | null;
  sha: string;
  onOpenFile: (path: string) => void;
}

/** The files to read first, in the order the API returned them. */
export function ReviewFocus({ items, prPaths, newFiles, repoFullName, sha, onOpenFile }: ReviewFocusProps) {
  const t = useTranslations("brief");
  return (
    <section>
      <Card>
        <SectionLabel
          icon="ListChecks"
          right={items.length > 0 ? <Badge color="var(--accent-text)" bg="var(--accent-bg)">{items.length}</Badge> : undefined}
        >
          {t("focus.title")}
        </SectionLabel>
        {items.length === 0 ? (
          <p style={s.none}>{t("focus.none")}</p>
        ) : (
          <ol style={s.list}>
            {items.map((item, i) => (
              <li key={i} style={s.item}>
                <span aria-hidden="true" style={s.marker}>
                  ▸
                </span>
                <span style={s.reason}>
                  <FileRefLink
                    file={item.file}
                    startLine={item.line}
                    target={refTarget(item.file, prPaths)}
                    newFile={newFiles?.has(item.file) ?? false}
                    repoFullName={repoFullName}
                    sha={sha}
                    onOpenFile={onOpenFile}
                  />
                  {` — ${item.reason}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
