"use client";

import { useTranslations } from "next-intl";
import type { Severity } from "@devdigest/shared";
import { SEV } from "@devdigest/ui";
import { SEVERITIES } from "@/lib/severity";
import { s } from "./styles";

/**
 * One clickable dot per present severity on a Smart Diff file header, worst
 * severity first (`SEVERITIES`). Each dot carries its count as a visible
 * text child and a real accessible name — `@devdigest/ui`'s `Badge` drops
 * `aria-label` silently (`client/INSIGHTS.md`, 2026-09-20), so this is a
 * plain `<button>`, not a `Badge`. Renders in `FileCard`'s `pathAdornment`
 * slot, which sits inside the header's open/close `onClick` — every button
 * stops propagation before calling its handler.
 */
export function FindingSeverityDots({
  counts,
  flaggedLineCount,
  onSelect,
  onSelectFallback,
}: {
  counts: Record<Severity, number>;
  flaggedLineCount: number;
  onSelect: (severity: Severity) => void;
  onSelectFallback: () => void;
}) {
  const t = useTranslations("smartDiff");
  const present = SEVERITIES.filter((sev) => counts[sev] > 0);

  if (present.length === 0) {
    if (flaggedLineCount === 0) return null;
    return (
      <span style={s.row}>
        <button
          type="button"
          style={s.fallbackDot}
          aria-label={t("flaggedLinesBadge", { count: flaggedLineCount })}
          onClick={(e) => {
            e.stopPropagation();
            onSelectFallback();
          }}
        />
      </span>
    );
  }

  return (
    <span style={s.row}>
      {present.map((sev) => (
        <button
          key={sev}
          type="button"
          style={s.dot(SEV[sev].c, SEV[sev].bg)}
          aria-label={t("severityFindingsBadge", { count: counts[sev], severity: SEV[sev].label })}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(sev);
          }}
        >
          {counts[sev]}
        </button>
      ))}
    </span>
  );
}
