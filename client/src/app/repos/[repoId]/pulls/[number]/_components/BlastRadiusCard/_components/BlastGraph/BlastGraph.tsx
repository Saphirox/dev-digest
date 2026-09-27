"use client";

import { useTranslations } from "next-intl";
import { MermaidDiagram } from "@/components/mermaid-diagram/MermaidDiagram";
import type { BlastRadius } from "@devdigest/shared";
import { buildBlastMermaid } from "../../helpers";
import { s } from "./styles";

/**
 * Left-to-right node-link diagram (changed symbol -> callers -> endpoints),
 * built by `helpers.buildBlastMermaid`. Crons are not graphed — the legend
 * below has exactly the 3 entries the reference screenshot shows. Wrapped in
 * `role="img"` since the SVG mermaid renders is presentational, not
 * interactive.
 */
export function BlastGraph({ blast }: { blast: BlastRadius }) {
  const t = useTranslations("blast");
  const hasEdges = blast.downstream.some((d) => d.callers.length > 0 || d.endpoints_affected.length > 0);

  if (!hasEdges) {
    return <div style={s.placeholder}>{t("graph.empty")}</div>;
  }

  const { chart, truncated } = buildBlastMermaid(blast);

  return (
    <div role="img" aria-label={t("graph.ariaLabel")}>
      <MermaidDiagram chart={chart} />
      {truncated && <div style={s.truncated}>{t("graph.truncated")}</div>}
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent-text)")} aria-hidden="true" />
          {t("graph.legend.changedSymbol")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--text-secondary)")} aria-hidden="true" />
          {t("graph.legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent-text)")} aria-hidden="true" />
          {t("graph.legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
