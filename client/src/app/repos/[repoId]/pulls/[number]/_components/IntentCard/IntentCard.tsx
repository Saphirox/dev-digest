"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Icon, SectionLabel } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null | undefined;
  /** The PR's current head sha — used only to double-check staleness against
      the freshest value the page has (the server already computes `stale`
      against its own read of `head_sha`; this just avoids a one-beat lag if
      the intent record was cached before a newer commit landed). */
  headSha: string;
  /** Rendered at the bottom of the card, under a divider — the PR Brief's
      Risk areas live here. */
  footer?: React.ReactNode;
}

/**
 * Intent card (Overview tab, inside the PR Brief block). Shows the derived
 * `{intent, in_scope, out_of_scope}`, missing-context refs when any, and a
 * re-derive action — a hybrid of "auto-derive when a
 * review runs" (server-side, run-executor) and this explicit button.
 */
export function IntentCard({ prId, headSha, footer }: IntentCardProps) {
  const t = useTranslations("intent");
  const { data: intent, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) return null;

  if (!intent) {
    return (
      <section>
        <Card>
          <SectionLabel icon="Target">{t("chip")}</SectionLabel>
          <EmptyState
            icon="Sparkles"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
            onCta={() => derive.mutate()}
            ctaLoading={derive.isPending}
          />
          {footer && <div style={s.footer}>{footer}</div>}
        </Card>
      </section>
    );
  }

  const stale = intent.stale || intent.derived_for_sha !== headSha;

  return (
    <section>
      <Card>
        <SectionLabel
          icon="Target"
          right={
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
          }
        >
          {t("chip")}
        </SectionLabel>
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

        {footer && <div style={s.footer}>{footer}</div>}
      </Card>
    </section>
  );
}
