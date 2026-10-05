/* ProjectContextPicker — the shared "Project context" list behind the agent and
   skill Context tabs. Every document of the repository is a row: tick to attach,
   drag (or ↑/↓ on the handle) to reorder the attached ones — earlier documents
   appear earlier in the injected block — and Preview to read one. The caller owns
   the attached paths (`value`) and saves each change. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { useContextFiles } from "@/lib/hooks/core";
import { DOC_TYPE_COLORS } from "./constants";
import { buildRows, filterRows, moveTo, sumTokens, toggle } from "./helpers";
import { DocPreviewDrawer } from "./_components/DocPreviewDrawer";
import { s } from "./styles";

export interface PickerCounts {
  attached: number;
  total: number;
}

export function ProjectContextPicker({
  repoId,
  value,
  onChange,
  renderHeader,
  hint,
  footerNote,
  previewIconOnly = false,
}: {
  repoId: string | null;
  /** Attached repo-relative paths, in injection order. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Heading + badge, left of the filter box. */
  renderHeader: (counts: PickerCounts) => React.ReactNode;
  hint?: React.ReactNode;
  footerNote?: string;
  /** Show Preview as an eye icon only (the skill tab); the accessible name stays. */
  previewIconOnly?: boolean;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextFiles(repoId);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (isLoading) return <Skeleton height={220} />;
  if (isError) return <p style={s.message}>{t("loadError")}</p>;

  const files = data?.files ?? [];
  const rows = buildRows(files, value);
  const visible = filterRows(rows, filter);
  const previewRow = rows.find((r) => r.path === previewPath);

  const onDrop = (targetPath: string) => {
    if (dragPath && dragPath !== targetPath) onChange(moveTo(value, dragPath, value.indexOf(targetPath)));
    setDragPath(null);
    setOverPath(null);
  };

  // What replaces the list when there is nothing to list.
  const emptyKind = data && !data.cloned ? "notCloned" : rows.length === 0 ? "empty" : null;
  const noMatch = !emptyKind && visible.length === 0;
  const showList = !emptyKind && !noMatch;
  const tokens = sumTokens(rows);

  return (
    <div>
      <div style={s.header}>
        {renderHeader({ attached: value.length, total: files.length })}
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filterPlaceholder")}
            aria-label={t("filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      {hint && <p style={s.hint}>{hint}</p>}

      {emptyKind && <EmptyState icon="Folder" title={t(`${emptyKind}.title`)} body={t(`${emptyKind}.body`)} />}
      {noMatch && <p style={s.message}>{t("noMatch")}</p>}

      {showList && (
        <ol style={s.list} aria-label={t("page.tree")}>
          {visible.map((row) => {
            const index = value.indexOf(row.path);
            const typeColors = row.type ? DOC_TYPE_COLORS[row.type] : null;
            return (
              <li
                key={row.path}
                data-testid={`context-row-${row.path}`}
                draggable={row.attached}
                onDragStart={(e) => {
                  setDragPath(row.path);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  // Only attached rows accept a drop.
                  if (!dragPath || !row.attached) return;
                  e.preventDefault();
                  setOverPath(row.path);
                }}
                onDragLeave={() => setOverPath((cur) => (cur === row.path ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(row.path);
                }}
                onDragEnd={() => {
                  setDragPath(null);
                  setOverPath(null);
                }}
                style={s.row(overPath === row.path && dragPath !== row.path, row.attached)}
              >
                <button
                  type="button"
                  style={s.handle(row.attached)}
                  disabled={!row.attached}
                  aria-label={t("moveHint", { name: row.name })}
                  title={row.attached ? t("dragHandle") : t("dragDisabled")}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      onChange(moveTo(value, row.path, index + (e.key === "ArrowUp" ? -1 : 1)));
                    }
                  }}
                >
                  <Icon.Menu size={15} />
                </button>
                <Checkbox
                  checked={row.attached}
                  onChange={(on) => onChange(toggle(value, row.path, on))}
                  label={
                    <span className="mono" style={s.name}>
                      {row.name}
                    </span>
                  }
                />
                <span className="mono" style={s.folder}>
                  {row.folder}
                </span>
                {row.missing && (
                  <span title={t("missingHint")}>
                    <Badge color="var(--warn)" bg="var(--warn-bg)">
                      {t("missing")}
                    </Badge>
                  </span>
                )}
                <span style={s.spacer} />
                {typeColors && row.type && (
                  <Badge color={typeColors.color} bg={typeColors.bg}>
                    {t(`type.${row.type}`)}
                  </Badge>
                )}
                <button
                  type="button"
                  style={s.previewBtn(previewIconOnly)}
                  disabled={row.missing}
                  aria-label={t("previewLabel", { name: row.name })}
                  onClick={() => setPreviewPath(row.path)}
                >
                  <Icon.Eye size={13} />
                  {!previewIconOnly && <span aria-hidden="true">{t("preview")}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {showList && (
        <div style={s.footer}>
          <span className="mono" style={s.tokens}>
            {tokens == null ? t("tokensUnknown") : t("tokens", { count: tokens })}
          </span>
          {footerNote && <span style={s.footerNote}>{footerNote}</span>}
        </div>
      )}

      {repoId && previewRow && (
        <DocPreviewDrawer
          repoId={repoId}
          path={previewRow.path}
          tokens={previewRow.tokens}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
