"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { usePrRisks } from "@/lib/hooks";
import { RiskRow } from "./RiskRow";
import { s } from "./styles";

interface RiskAreasProps {
  prId: string | null | undefined;
  repoFullName: string | null;
}

/**
 * Risk Areas — deterministic diff-grounded risk rows, mounted inside
 * `<IntentCard>` below the scope columns. `risks: []` (nothing matched, or a
 * loading/error state) never invents a row; a query error shows an explicit
 * message rather than a fabricated one. Expansion is per-row (a `Set` of
 * `kind:title` keys held here), all collapsed initially — never mirrors
 * server data into state.
 *
 * Deliberately does NOT take the page's `headSha` prop — GitHub blob links
 * are built from `data.derived_for_sha`, the sha refs were actually grounded
 * against, so a link can never point at lines from a different commit.
 */
export function RiskAreas({ prId, repoFullName }: RiskAreasProps) {
  const t = useTranslations("intent");
  const { data, isLoading, isError } = usePrRisks(prId);
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  if (isLoading) return null;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const risks = data?.risks ?? [];

  return (
    <section>
      <SectionLabel icon="AlertTriangle">{t("risks.title")}</SectionLabel>
      {isError ? (
        <div style={s.placeholder}>{t("risks.error")}</div>
      ) : !data || risks.length === 0 ? (
        <div style={s.placeholder}>{t("risks.none")}</div>
      ) : (
        <div style={s.rows}>
          {risks.map((risk, i) => {
            // `kind:title` alone collides: `detectPerformance` emits one risk
            // per (pattern label, file) but the title never names the file,
            // so two risks from the same pattern in different files are
            // byte-identical on `kind`+`title` — the expand/collapse `open`
            // Set then drives both rows off one key. `groundRisks` guarantees
            // every surviving risk has >=1 ref, so fold in the first ref's
            // own location (`i` as a last-resort tiebreaker, never relied on
            // alone) to make the key carry the risk's own identity.
            const first = risk.refs[0];
            const key = first
              ? `${risk.kind}:${risk.title}:${first.file}:${first.start_line}`
              : `${risk.kind}:${risk.title}:${i}`;
            return (
              <RiskRow
                key={key}
                risk={risk}
                open={open.has(key)}
                onToggle={() => toggle(key)}
                derivedForSha={data.derived_for_sha}
                repoFullName={repoFullName}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
