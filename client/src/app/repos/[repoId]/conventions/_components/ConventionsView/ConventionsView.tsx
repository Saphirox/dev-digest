/* ConventionsView — /repos/:repoId/conventions: scan the repo for house rules
   ("Run scan" the first time, "Re-scan" after), review each candidate (accept /
   reject / edit the rule), filter by category, and merge the accepted ones into
   a skill ("Create skill" shows once something is accepted). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionCategory, ConventionSkillDraft } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  useConventionSkillDraft,
  useConventions,
  useDeleteConvention,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { acceptedStats, applyFrozenOrder, categoryCounts, sortConventions, timeAgo } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repoName = repos.find((r) => r.id === repoId)?.name ?? t("page.repoFallback");
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const remove = useDeleteConvention(repoId);
  const draft = useConventionSkillDraft(repoId);
  const [category, setCategory] = React.useState<ConventionCategory | null>(null);
  const [skillDraft, setSkillDraft] = React.useState<ConventionSkillDraft | null>(null);

  // Rejecting deletes a candidate; rows rejected before that change stay hidden.
  const all = (data?.conventions ?? []).filter((c) => c.status !== "rejected");
  // Sorted once per scan (accepted first, then pending); accepting or rejecting
  // keeps the order, so cards don't jump. A new scan or a reload sorts again.
  const scanKey = data?.last_scan_at ?? null;
  const [frozen, setFrozen] = React.useState<{ scan: string | null; ids: string[] } | null>(null);
  if (data && (frozen === null || frozen.scan !== scanKey)) {
    setFrozen({ scan: scanKey, ids: sortConventions(all).map((c) => c.id) });
  }
  const ordered = applyFrozenOrder(all, frozen?.ids ?? null);
  const visible = category ? ordered.filter((c) => c.category === category) : ordered;
  const { accepted, total } = acceptedStats(all);
  const scanned = !!data?.last_scan_at;

  const scan = () =>
    extract.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(t("page.scanResult", { proposed: r.proposed, dropped: r.dropped_ungrounded })),
    });
  const deselectAll = () =>
    all.filter((c) => c.status === "accepted").forEach((c) => update.mutate({ id: c.id, patch: { status: "pending" } }));
  const createSkill = () => draft.mutate(undefined, { onSuccess: setSkillDraft });

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {skillDraft && (
        <CreateSkillFromConventionsModal
          draft={skillDraft}
          repoName={repoName}
          onClose={() => setSkillDraft(null)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            <p style={s.meta}>
              {data?.last_scan_at && data.sampled_files != null
                ? t("page.meta", { count: data.sampled_files, when: timeAgo(data.last_scan_at) })
                : t("page.metaNever")}
            </p>
          </div>
          {scanned && (
            <Button kind="secondary" icon="RefreshCw" onClick={scan} loading={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {isLoading && <Skeleton height={180} />}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {data && all.length === 0 && !scanned && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={scan}
            ctaLoading={extract.isPending}
          />
        )}
        {data && all.length === 0 && scanned && (
          <EmptyState icon="ListChecks" title={t("page.emptyScanned.title")} body={t("page.emptyScanned.body")} />
        )}

        {all.length > 0 && (
          <>
            <div style={s.toolbar}>
              <Button kind="secondary" size="sm" icon="X" onClick={deselectAll} disabled={accepted === 0}>
                {t("page.deselectAll")}
              </Button>
              <span style={s.count}>{t("page.acceptedCount", { accepted, total })}</span>
              <span style={s.spacer} />
              {accepted > 0 && (
                <Button kind="primary" icon="Sparkles" onClick={createSkill} loading={draft.isPending}>
                  {t("page.createSkill")}
                </Button>
              )}
            </div>
            <div style={s.chips}>
              <Chip active={category === null} onClick={() => setCategory(null)} count={all.length}>
                {t("page.allCategories")}
              </Chip>
              {categoryCounts(all).map(([cat, n]) => (
                <Chip key={cat} active={category === cat} onClick={() => setCategory(cat)} count={n}>
                  {t(`card.category.${cat}`)}
                </Chip>
              ))}
            </div>
            <div style={s.list}>
              {visible.map((c) => (
                <ConventionCard
                  key={c.id}
                  convention={c}
                  onStatus={(status) => update.mutate({ id: c.id, patch: { status } })}
                  onReject={() => remove.mutate(c.id)}
                  onRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
