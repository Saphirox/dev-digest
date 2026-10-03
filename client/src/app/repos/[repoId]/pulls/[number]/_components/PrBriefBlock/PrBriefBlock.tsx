"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SectionLabel } from "@devdigest/ui";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { useGenerateBrief, usePrBlast, usePrBrief } from "@/lib/hooks";
import { BriefBanner } from "./_components/BriefBanner";
import { BriefRisks } from "./_components/BriefRisks";
import { ReviewFocus } from "./_components/ReviewFocus";
import { latestReview } from "@/lib/latest-review";
import { blobSha, isNewFile } from "./helpers";
import { s } from "./styles";

interface PrBriefBlockProps {
  prId: string | null | undefined;
  /** The PR's current head sha — a brief generated for another one is stale. */
  headSha: string;
  prFiles: PrFile[];
  /** Reviews, newest first (the banner reuses the latest completed one). */
  reviews: ReviewRecord[];
  /** `owner/repo`, or `null` when unknown. */
  repoFullName: string | null;
  /** Opens a file of the PR on Files changed. */
  onOpenFile: (path: string) => void;
  /** The Intent and Blast radius blocks, composed by the page. As a function
   *  it receives the Risk areas (null until a brief exists) to place inside
   *  the Intent block; otherwise Risk areas render after the children. */
  children?: React.ReactNode | ((slots: { risks: React.ReactNode }) => React.ReactNode);
}

/**
 * The Overview tab's PR Brief block: summary banner (or the Generate button),
 * the Intent and Blast radius blocks passed as `children`, then Risk areas,
 * Review focus and the list of inputs that were missing. Generation is
 * on demand only — nothing here calls the model on load.
 */
export function PrBriefBlock({
  prId,
  headSha,
  prFiles,
  reviews,
  repoFullName,
  onOpenFile,
  children,
}: PrBriefBlockProps) {
  const t = useTranslations("brief");
  const { data: brief, isLoading } = usePrBrief(prId);
  const { data: blast } = usePrBlast(prId);
  const generate = useGenerateBrief(prId);

  const prPaths = React.useMemo(() => new Set(prFiles.map((f) => f.path)), [prFiles]);
  const newFiles = React.useMemo(
    () => new Set(prFiles.filter((f) => isNewFile(f.patch)).map((f) => f.path)),
    [prFiles],
  );
  const sha = blobSha(blast, headSha);
  const stale = brief != null && brief.generated_for_sha !== headSha;
  const pending = generate.isPending;
  const error = generate.isError
    ? t("error", { message: generate.error instanceof Error ? generate.error.message : String(generate.error) })
    : null;

  const placeRisks = typeof children === "function";
  const risks = brief ? (
    <BriefRisks
      risks={brief.risks}
      prPaths={prPaths}
      newFiles={newFiles}
      repoFullName={repoFullName}
      sha={sha}
      onOpenFile={onOpenFile}
      embedded={placeRisks}
    />
  ) : null;

  return (
    <div style={s.block}>
      <section aria-label={t("title")}>
        <SectionLabel
          icon="FileText"
          right={
            brief ? (
              <div style={s.header}>
                {stale && (
                  <Badge color="var(--warn)" bg="var(--warn-bg)">
                    {t("stale")}
                  </Badge>
                )}
                {pending && (
                  <span role="status" style={s.status}>
                    {t("generating")}
                  </span>
                )}
                {error && (
                  <p role="alert" style={s.error}>
                    {error}
                  </p>
                )}
                <Button
                  type="button"
                  kind="ghost"
                  size="sm"
                  icon="RefreshCw"
                  aria-label={t("refresh")}
                  title={t("refresh")}
                  loading={pending}
                  onClick={() => generate.mutate()}
                />
              </div>
            ) : undefined
          }
        >
          {t("title")}
        </SectionLabel>

        {brief ? (
          <BriefBanner brief={brief} review={latestReview(reviews)} />
        ) : isLoading ? null : (
          <div style={s.cta}>
            <Icon.Sparkles size={20} style={{ color: "var(--accent-text)" }} />
            <div style={s.ctaText}>
              <span style={s.ctaTitle}>{t("emptyTitle")}</span>
              <p style={s.ctaBody}>{t("emptyBody")}</p>
            </div>
            <div style={s.ctaAction}>
              <Button type="button" kind="primary" icon="Sparkles" loading={pending} onClick={() => generate.mutate()}>
                {pending ? t("generating") : t("generate")}
              </Button>
              {error && (
                <p role="alert" style={s.error}>
                  {error}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {placeRisks ? children({ risks }) : children}

      {brief && (
        <>
          {!placeRisks && risks}
          <ReviewFocus
            items={brief.review_focus}
            prPaths={prPaths}
            newFiles={newFiles}
            repoFullName={repoFullName}
            sha={sha}
            onOpenFile={onOpenFile}
          />
          {brief.missing_inputs.length > 0 && (
            <p style={s.missing}>{t("missingInputs", { items: brief.missing_inputs.join(", ") })}</p>
          )}
        </>
      )}
    </div>
  );
}
