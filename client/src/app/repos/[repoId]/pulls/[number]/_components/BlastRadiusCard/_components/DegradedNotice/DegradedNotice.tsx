"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks";
import { DEGRADED_REASON_KEY, RESYNC_HELPS } from "./constants";
import { s } from "./styles";

interface DegradedNoticeProps {
  reason: BlastDegradedReason | undefined;
  repoId: string;
  prId: string | null | undefined;
}

/**
 * Shown when the blast radius fell back to a non-persistent read
 * (`BlastRadius.degraded`). `role="status"` so the reason is announced
 * without stealing focus. The resync button only appears for reasons a
 * resync can actually fix (`RESYNC_HELPS`); after a click it polls the
 * repo-intel index state until `updatedAt` advances, then invalidates this
 * PR's cached blast radius so the next read picks up the fresh index.
 */
export function DegradedNotice({ reason, repoId, prId }: DegradedNoticeProps) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [polling, setPolling] = React.useState(false);
  const baselineRef = React.useRef<string | null>(null);
  const { data: indexState } = useRepoIntelStatus(repoId, polling);

  React.useEffect(() => {
    if (!polling || !indexState) return;
    if (baselineRef.current !== null && indexState.updatedAt !== baselineRef.current) {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
    }
  }, [polling, indexState, qc, prId]);

  if (!reason) return null;

  const handleResync = () => {
    baselineRef.current = indexState?.updatedAt ?? null;
    setPolling(true);
    resync.mutate();
  };

  return (
    <div role="status" style={s.notice}>
      <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden="true" />
      <span style={s.text}>
        {polling ? t("degraded.resyncStarted") : t(`degraded.reason.${DEGRADED_REASON_KEY[reason]}`)}
      </span>
      {RESYNC_HELPS[reason] && (
        <Button type="button" size="sm" icon="RefreshCw" loading={resync.isPending || polling} onClick={handleResync}>
          {polling ? t("degraded.resyncing") : t("degraded.resync")}
        </Button>
      )}
    </div>
  );
}
