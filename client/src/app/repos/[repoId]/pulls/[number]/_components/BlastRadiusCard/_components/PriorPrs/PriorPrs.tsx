"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { usePrPriorPrs } from "@/lib/hooks";
import { s } from "./styles";

interface PriorPrsProps {
  prId: string | null | undefined;
}

/**
 * Collapsed footer — "Prior PRs touching these files". `usePrPriorPrs` only
 * fetches once `open`, so collapsing this on mount (and staying collapsed)
 * means zero GitHub-backed requests for a PR the reader never expands.
 */
export function PriorPrs({ prId }: PriorPrsProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError } = usePrPriorPrs(prId, open);
  const history = data?.history ?? [];

  return (
    <div style={s.footer}>
      <button
        type="button"
        style={s.header}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon.History size={14} aria-hidden="true" />
        <span style={s.title}>{t("priorPrs.title")}</span>
        {history.length > 0 && <Badge>{history.length}</Badge>}
        <Icon.ChevronRight size={14} style={s.chevron(open)} aria-hidden="true" />
      </button>

      {open && (
        <div style={s.body}>
          {isLoading ? (
            <div style={s.placeholder}>{t("priorPrs.loading")}</div>
          ) : isError ? (
            <div style={s.placeholder}>{t("priorPrs.error")}</div>
          ) : history.length === 0 ? (
            <div style={s.placeholder}>{t("priorPrs.none")}</div>
          ) : (
            <ul style={s.list}>
              {history.map((item) => (
                <li key={item.pr_number} style={s.item}>
                  <span className="mono">#{item.pr_number}</span>
                  <span>{item.title}</span>
                  <span style={s.overlap}>{t("priorPrs.overlap", { count: item.files_overlap.length })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
