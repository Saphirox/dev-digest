"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, IconBtn, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { ENDPOINT_CHIPS_PAGE } from "./constants";
import { s } from "./styles";

interface SymbolRowProps {
  impact: DownstreamImpact;
  open: boolean;
  onToggle: () => void;
  /** `owner/repo`, or `null` — a missing repo means plain mono text, never a
   *  `MonoLink` with `href={undefined}` (that renders a dead `<button>`). */
  repoFullName: string | null;
  /** `indexed_sha ?? headSha` — the commit caller links are built against. */
  sha: string;
}

/** One changed-symbol row: chevron, symbol name, caller count badge, and
 *  (expanded) its callers as `file:line` plus endpoint/cron chips. */
export function SymbolRow({ impact, open, onToggle, repoFullName, sha }: SymbolRowProps) {
  const t = useTranslations("blast");
  const callerCount = impact.callers.length;
  const hasChips = impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0;
  const [endpointLimit, setEndpointLimit] = React.useState(ENDPOINT_CHIPS_PAGE);
  const totalEndpoints = impact.endpoints_affected.length;
  const visibleEndpoints = impact.endpoints_affected.slice(0, endpointLimit);
  const remainingEndpoints = totalEndpoints - visibleEndpoints.length;
  const nextEndpointCount = Math.min(ENDPOINT_CHIPS_PAGE, remainingEndpoints);

  return (
    <div style={s.row}>
      <div style={s.rowHeader}>
        <IconBtn
          size={26}
          icon={open ? "ChevronDown" : "ChevronRight"}
          label={open ? t("collapse") : t("expand")}
          onClick={onToggle}
        />
        <Icon.Code size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-hidden="true" />
        <span className="mono" style={s.symbolName}>
          {impact.symbol}()
        </span>
        <span className="tnum" style={s.callerBadge}>
          {t("callerCount", { count: callerCount })}
        </span>
      </div>

      {open && (
        <div style={s.body}>
          {callerCount === 0 ? (
            <div style={s.placeholder}>{t("noCallers")}</div>
          ) : (
            <ul style={s.callerList}>
              {impact.callers.map((c) => (
                <li key={`${c.file}:${c.line}:${c.name}`} style={s.callerItem}>
                  <Icon.CornerDownRight size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                  {repoFullName ? (
                    <MonoLink href={githubBlobUrl(repoFullName, sha, c.file, c.line)}>
                      {c.file}:{c.line}
                    </MonoLink>
                  ) : (
                    <span className="mono" style={s.callerPlain}>
                      {c.file}:{c.line}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hasChips && (
            <div style={s.chips}>
              {impact.endpoints_affected.length > 0 && (
                <div role="group" aria-label={t("endpoints")} style={s.chipGroup}>
                  {visibleEndpoints.map((ep) => (
                    <Badge key={ep} icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)" mono>
                      {ep}
                    </Badge>
                  ))}
                </div>
              )}
              {remainingEndpoints > 0 ? (
                <Button
                  kind="ghost"
                  size="sm"
                  type="button"
                  style={s.showMore}
                  onClick={() => setEndpointLimit((l) => l + ENDPOINT_CHIPS_PAGE)}
                >
                  {t("showMoreEndpoints", { count: nextEndpointCount })}
                </Button>
              ) : totalEndpoints > ENDPOINT_CHIPS_PAGE ? (
                <Button
                  kind="ghost"
                  size="sm"
                  type="button"
                  style={s.showMore}
                  onClick={() => setEndpointLimit(ENDPOINT_CHIPS_PAGE)}
                >
                  {t("showLessEndpoints")}
                </Button>
              ) : null}
              {impact.crons_affected.length > 0 && (
                <div role="group" aria-label={t("crons")} style={s.chipGroup}>
                  {impact.crons_affected.map((cron) => (
                    <Badge key={cron} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono>
                      {cron}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
