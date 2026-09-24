"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, MonoLink, SEV } from "@devdigest/ui";
import type { Risk, RiskSeverity } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { RISK_ICON } from "./constants";
import { formatRef } from "./helpers";
import { s } from "./styles";

/** Kind glyph tinted by severity — a local `Record<RiskSeverity, string>`
    reusing the finding severity palette (`SEV[x].c`), not a new token set. */
const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: SEV.CRITICAL.c,
  medium: SEV.WARNING.c,
  low: SEV.SUGGESTION.c,
};

interface RiskRowProps {
  risk: Risk;
  open: boolean;
  onToggle: () => void;
  /** The sha refs were GROUNDED against (`PrRisks.derived_for_sha`), never
      the page's own `headSha` prop — those can diverge (e.g. a newer commit
      landed after this scan ran), and a link built from the wrong sha can
      point at lines that don't match `risk.refs` on GitHub. */
  derivedForSha: string;
  repoFullName: string | null;
}

/** One bordered risk pill: kind glyph, bold title, first ref, and a chevron
    that expands the explanation + any remaining refs. */
export function RiskRow({ risk, open, onToggle, derivedForSha, repoFullName }: RiskRowProps) {
  const t = useTranslations("intent");
  const I = Icon[RISK_ICON[risk.kind]];
  const [firstRef, ...restRefs] = risk.refs;

  const refHref = (file: string, start: number, end: number) =>
    repoFullName ? githubBlobUrl(repoFullName, derivedForSha, file, start, end) : undefined;

  return (
    <div style={s.row}>
      <div style={s.rowHeader}>
        <I size={15} style={{ color: SEVERITY_COLOR[risk.severity], flexShrink: 0 }} />
        <div style={s.rowMain}>
          <div style={s.title}>{risk.title}</div>
          {firstRef && (
            <MonoLink href={refHref(firstRef.file, firstRef.start_line, firstRef.end_line)}>
              {formatRef(firstRef)}
            </MonoLink>
          )}
        </div>
        <IconBtn
          icon={open ? "ChevronDown" : "ChevronRight"}
          label={open ? t("risks.collapse") : t("risks.expand")}
          onClick={onToggle}
        />
      </div>

      {open && (
        <div style={s.body}>
          <p style={s.explanation}>{risk.explanation}</p>
          {restRefs.length > 0 && (
            <ul style={s.refList}>
              {restRefs.map((ref, i) => (
                <li key={i}>
                  <MonoLink href={refHref(ref.file, ref.start_line, ref.end_line)}>
                    {formatRef(ref)}
                  </MonoLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
