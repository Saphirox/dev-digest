"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Icon, SectionLabel, SEV } from "@devdigest/ui";
import type { Risk, RiskSeverity } from "@devdigest/shared";
import { refTarget } from "../../helpers";
import { FileRefLink } from "../FileRefLink";
import { s } from "./styles";

/** Brief severity → the finding severity whose colour and glyph it reuses. */
const SEVERITY_TOKEN: Record<RiskSeverity, (typeof SEV)[keyof typeof SEV]> = {
  high: SEV.CRITICAL,
  medium: SEV.WARNING,
  low: SEV.SUGGESTION,
};

interface BriefRisksProps {
  risks: Risk[];
  prPaths: ReadonlySet<string>;
  /** Files the PR adds (see `isNewFile`). */
  newFiles?: ReadonlySet<string>;
  repoFullName: string | null;
  sha: string;
  onOpenFile: (path: string) => void;
  /** Render without its own card — for placing it inside the Intent card. */
  embedded?: boolean;
}

/** Risk areas from the brief. Model text renders as plain JSX text only. */
export function BriefRisks({ risks, prPaths, newFiles, repoFullName, sha, onOpenFile, embedded = false }: BriefRisksProps) {
  const t = useTranslations("brief");
  const body = (
    <>
        <SectionLabel icon="AlertTriangle">{t("risks.title")}</SectionLabel>
        {risks.length === 0 ? (
          <p style={s.none}>{t("noRisks")}</p>
        ) : (
          <ul style={s.list}>
            {risks.map((risk, i) => {
              const sev = SEVERITY_TOKEN[risk.severity];
              const SevIcon = Icon[sev.icon];
              return (
                <li key={i} style={s.row}>
                  <span role="img" aria-label={t(`risks.severity.${risk.severity}`)} style={s.icon(sev.c)}>
                    <SevIcon size={14} />
                  </span>
                  <div style={s.main}>
                    <div style={s.title}>{risk.title}</div>
                    <div style={s.refs}>
                      {risk.file_refs.map((ref, j) => (
                        <FileRefLink
                          key={j}
                          file={ref.file}
                          startLine={ref.start_line}
                          endLine={ref.end_line}
                          target={refTarget(ref.file, prPaths)}
                    newFile={newFiles?.has(ref.file) ?? false}
                          repoFullName={repoFullName}
                          sha={sha}
                          onOpenFile={onOpenFile}
                        />
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );
  if (embedded) return <section aria-label={t("risks.title")}>{body}</section>;
  return (
    <section>
      <Card>{body}</Card>
    </section>
  );
}
