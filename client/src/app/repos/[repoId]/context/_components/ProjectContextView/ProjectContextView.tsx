/* ProjectContextView — /repos/:repoId/context: the repository's project
   documents as a folder tree on the left; the selected one rendered as markdown
   on the right. The refresh button re-reads the list (no cache on the server). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, Markdown, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextFile, useContextFiles } from "@/lib/hooks/core";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { buildTree, resolveSelected } from "./helpers";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const root = repos.find((r) => r.id === repoId)?.full_name ?? "";
  const { data, isLoading, isError, isFetching, refetch } = useContextFiles(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const files = data?.files ?? [];
  const activePath = resolveSelected(files, selected);
  const activeFile = files.find((f) => f.path === activePath);
  const doc = useContextFile(repoId, activePath);

  const crumb = [{ label: root || t("title") }, { label: t("title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.frame}>
        <nav style={s.rail} aria-label={t("page.tree")}>
          <div style={s.railHead}>
            <div style={s.railTitle}>{t("title")}</div>
            <div className="mono" style={s.railRoot}>
              {root}
            </div>
          </div>
          <div style={s.toolbar}>
            <IconBtn icon="RefreshCw" label={t("refresh")} onClick={() => void refetch()} active={isFetching} />
          </div>
          <div style={s.tree}>
            {isLoading && <Skeleton height={160} />}
            {buildTree(files).map((group) => (
              <div key={group.folder}>
                {group.folder && (
                  <div className="mono" style={s.folder}>
                    {group.folder}
                  </div>
                )}
                <ul style={s.list}>
                  {group.files.map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        className="mono"
                        style={s.file(f.path === activePath)}
                        aria-current={f.path === activePath ? "true" : undefined}
                        onClick={() => setSelected(f.path)}
                      >
                        <Icon.FileText size={14} style={s.fileIcon} />
                        {f.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <section style={s.pane}>
          {isError && <ErrorState title={t("loadError")} onRetry={() => void refetch()} />}
          {data && !data.cloned && <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />}
          {data && data.cloned && files.length === 0 && (
            <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body")} />
          )}
          {activeFile && (
            <>
              <div style={s.paneHead}>
                <span className="mono" style={s.paneName}>
                  {activeFile.path.slice(activeFile.path.lastIndexOf("/") + 1)}
                </span>
                <span className="mono" style={s.paneMeta}>
                  {activeFile.tokens == null ? t("tokensUnknown") : t("tokens", { count: activeFile.tokens })}
                </span>
              </div>
              <div className="skill-md" style={s.paneBody}>
                {doc.isLoading && <Skeleton height={160} />}
                {doc.isError && <p style={s.message}>{t("previewDrawer.loadError")}</p>}
                {doc.data && <Markdown>{doc.data.content ?? ""}</Markdown>}
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
