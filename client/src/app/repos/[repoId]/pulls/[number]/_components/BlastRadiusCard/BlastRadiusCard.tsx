"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks";
import { BlastSummary } from "./_components/BlastSummary";
import { DegradedNotice } from "./_components/DegradedNotice";
import { SymbolTree } from "./_components/SymbolTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs";
import { symbolKey } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null | undefined;
  repoId: string;
  /** The PR's current head sha — the fallback link target when the
   *  repo-intel index has no `indexed_sha` of its own. */
  headSha: string;
  /** `owner/repo`, or `null` when unknown — a missing repo renders caller
   *  refs as plain mono text instead of a `MonoLink`. */
  repoFullName: string | null;
}

type View = "tree" | "graph";

/**
 * Blast Radius card (Overview tab, right column next to Intent/Risk Areas —
 * see the reference screenshots in `docs/images/blast-radius/`). Reads
 * `GET /pulls/:id/blast`, a deterministic repo-intel index read with no
 * model call. Holds the Tree/Graph toggle and each symbol row's expand
 * state; the first 3 symbol rows start expanded (highest rank first, since
 * the server already sorts `downstream` by rank desc).
 */
export function BlastRadiusCard({ prId, repoId, headSha, repoFullName }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data: blast, isLoading, isError } = usePrBlast(prId);
  const [view, setView] = React.useState<View>("tree");
  const [openSymbols, setOpenSymbols] = React.useState<Set<string> | null>(null);

  if (isLoading) return null;

  if (isError || !blast) {
    return (
      <section>
        <Card>
          <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
          <div style={s.placeholder}>{t("error")}</div>
        </Card>
      </section>
    );
  }

  const hasChangedSymbols = blast.changed_symbols.length > 0;

  const defaultOpen = new Set(blast.downstream.slice(0, 3).map(symbolKey));
  const effectiveOpen = openSymbols ?? defaultOpen;
  const toggleSymbol = (key: string) =>
    setOpenSymbols((prev) => {
      const next = new Set(prev ?? defaultOpen);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sha = blast.indexed_sha ?? headSha;
  const totalCallers = blast.downstream.reduce((n, d) => n + d.callers.length, 0);

  return (
    <section>
      <Card>
        <SectionLabel icon="Workflow">{t("title")}</SectionLabel>

        {hasChangedSymbols && (
          <div style={s.statsRow}>
            <BlastSummary blast={blast} />
            <div style={s.toggle} role="group" aria-label={`${t("view.tree")}/${t("view.graph")}`}>
              <button
                type="button"
                aria-pressed={view === "tree"}
                style={s.toggleBtn(view === "tree")}
                onClick={() => setView("tree")}
              >
                {t("view.tree")}
              </button>
              <button
                type="button"
                aria-pressed={view === "graph"}
                style={s.toggleBtn(view === "graph")}
                onClick={() => setView("graph")}
              >
                {t("view.graph")}
              </button>
            </div>
          </div>
        )}

        <DegradedNotice reason={blast.reason} repoId={repoId} prId={prId} />

        {!hasChangedSymbols ? (
          <div style={s.placeholder}>{t("noSymbols")}</div>
        ) : view === "tree" ? (
          totalCallers === 0 ? (
            <div style={s.placeholder}>{t("noDownstream", { count: blast.changed_symbols.length })}</div>
          ) : (
            <SymbolTree
              downstream={blast.downstream}
              open={effectiveOpen}
              onToggle={toggleSymbol}
              repoFullName={repoFullName}
              sha={sha}
            />
          )
        ) : (
          <BlastGraph blast={blast} />
        )}

        <PriorPrs prId={prId} />
      </Card>
    </section>
  );
}
