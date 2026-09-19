/* ConventionCard — one extracted convention: the rule, the evidence it was
   grounded in, confidence, how often the pattern occurs, and Accept / Reject
   toggles (clicking an active one returns it to pending) plus Edit, which
   edits the rule in place (so does clicking the rule). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { HIGH_CONFIDENCE, evidenceLabel } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  convention: c,
  onStatus,
  onRule,
}: {
  convention: ConventionCandidate;
  onStatus: (status: ConventionStatus) => void;
  onRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [draft, setDraft] = React.useState<string | null>(null);
  const accepted = c.status === "accepted";
  const rejected = c.status === "rejected";
  const pct = Math.round(c.confidence * 100);

  const commit = () => {
    const next = draft?.trim();
    if (next && next !== c.rule) onRule(next);
    setDraft(null);
  };

  const copy = async () => {
    await navigator.clipboard?.writeText(c.evidence_snippet);
    toast.success(t("card.copied"));
  };

  return (
    <article style={s.card(accepted, rejected)} aria-label={c.rule}>
      <div style={s.main}>
        {draft === null ? (
          <button type="button" style={s.rule} title={t("card.edit")} onClick={() => setDraft(c.rule)}>
            {c.rule}
          </button>
        ) : (
          <>
            <input
              autoFocus
              aria-label={t("card.edit")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setDraft(null);
              }}
              style={s.ruleInput}
            />
            <div style={s.editHint}>{t("card.editHint")}</div>
          </>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <span className="mono">{evidenceLabel(c)}</span>
            <button type="button" style={s.copy} onClick={copy} aria-label={t("card.copy")} title={t("card.copy")}>
              <Icon.Copy size={14} />
            </button>
          </div>
          <pre className="mono" style={s.code}>
            {c.evidence_snippet}
          </pre>
        </div>

        <div style={s.metaRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={c.confidence >= HIGH_CONFIDENCE ? "var(--ok)" : "var(--warn)"} />
          </div>
          <span style={s.pct}>{pct}%</span>
          {c.occurrences != null && <span>{t("card.seenIn", { count: c.occurrences })}</span>}
          <Badge>{t(`card.category.${c.category}`)}</Badge>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={accepted}
          onClick={() => onStatus(accepted ? "pending" : "accepted")}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          icon="X"
          full
          aria-pressed={rejected}
          onClick={() => onStatus(rejected ? "pending" : "rejected")}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
        <Button kind="ghost" icon="Edit" full disabled={draft !== null} onClick={() => setDraft(c.rule)}>
          {t("card.editButton")}
        </Button>
      </div>
    </article>
  );
}
