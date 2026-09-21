"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Icon } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks";
import { RiskAreas } from "./_components/RiskAreas";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null | undefined;
  /** The PR's current head sha — used only to double-check staleness against
      the freshest value the page has (the server already computes `stale`
      against its own read of `head_sha`; this just avoids a one-beat lag if
      the intent record was cached before a newer commit landed). */
  headSha: string;
  /** `owner/repo` — used to build the Risk Areas GitHub blob links. Required
      (pass `null` explicitly when unknown) so a caller can't silently forget
      it; `null` renders refs as plain mono text instead of a broken link. */
  repoFullName: string | null;
}

/**
 * Intent card (Overview tab, above the PR description). Shows the derived
 * `{intent, in_scope, out_of_scope}`, the Risk Areas section, missing-context
 * refs when any, and a re-derive action — a hybrid of "auto-derive when a
 * review runs" (server-side, run-executor) and this explicit button.
 */
export function IntentCard({ prId, headSha, repoFullName }: IntentCardProps) {
  const t = useTranslations("intent");
  const { data: intent, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) return null;

  if (!intent) {
    return (
      <section>
        <Card>
          <EmptyState
            icon="Sparkles"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
            onCta={() => derive.mutate()}
            ctaLoading={derive.isPending}
          />
        </Card>
      </section>
    );
  }

  const stale = intent.stale || intent.derived_for_sha !== headSha;

  return (
    <section>
      <div style={s.header}>
        <span role="img" aria-label={t("chipLabel")} style={s.chipWrap}>
          <Icon.Target size={14} style={s.chipIcon} aria-hidden="true" />
          <span style={s.chip} aria-hidden="true">
            {t("chip")}
          </span>
        </span>
        <div style={s.actions}>
          {stale && (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("stale")}
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            icon="RefreshCw"
            loading={derive.isPending}
            onClick={() => derive.mutate()}
          >
            {t("rederive")}
          </Button>
        </div>
      </div>
      <Card>
        <p style={s.sentence}>&ldquo;{intent.intent}&rdquo;</p>

        <div style={s.columns}>
          <div>
            <div style={s.columnLabel(true)}>
              <Icon.Check size={14} style={{ color: "var(--ok)" }} />
              {t("inScope")}
            </div>
            {intent.in_scope.length === 0 ? (
              <div style={s.placeholder}>{t("none")}</div>
            ) : (
              <ul style={s.list}>
                {intent.in_scope.map((item, i) => (
                  <li key={i} style={s.listItem(true)}>
                    <span style={s.bullet}>•</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div style={s.columnLabel(false)}>
              <Icon.X size={14} style={{ color: "var(--text-muted)" }} />
              {t("outOfScope")}
            </div>
            {intent.out_of_scope.length === 0 ? (
              <div style={s.placeholder}>{t("none")}</div>
            ) : (
              <ul style={s.list}>
                {intent.out_of_scope.map((item, i) => (
                  <li key={i} style={s.listItem(false)}>
                    <span style={s.bullet}>•</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div style={s.risksWrap}>
          <RiskAreas prId={prId} repoFullName={repoFullName} />
        </div>

        {intent.missing_context.length > 0 && (
          <div style={s.missing}>
            <div style={s.columnLabel(false)}>{t("missingContext")}</div>
            <ul style={s.list}>
              {intent.missing_context.map((ref, i) => (
                <li key={i}>{ref}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
