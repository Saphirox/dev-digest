/* AgentColumn — one child run in Columns mode. Running: the run's live event
   stream (SSE) instead of findings; when the stream ends the page refetches
   (`onStreamEnd`). Done: its findings. Failed / cancelled: status + error, no
   score ring. An unknown duration or cost is "—", never 0. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, Icon, LiveLogStream, SEV } from "@devdigest/ui";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { useRunEvents } from "@/lib/hooks/reviews";
import { formatRunMeta } from "@/lib/run-estimate";
import { eventsToLog } from "./helpers";
import { s } from "./styles";

const LOG_HEIGHT = 200;

export function AgentColumn({
  run,
  review,
  onViewTrace,
  onStreamEnd,
}: {
  run: RunSummary;
  review: ReviewRecord | undefined;
  onViewTrace: (runId: string) => void;
  onStreamEnd: () => void;
}) {
  const t = useTranslations("multiAgent");
  const running = run.status === "running";
  const failed = run.status === "failed" || run.status === "cancelled";
  const findings = review?.findings ?? [];
  const name = run.agent_name ?? t("results.unknownAgent");

  const { events, running: streaming } = useRunEvents(running ? [run.run_id] : []);
  const wasStreaming = React.useRef(false);
  React.useEffect(() => {
    if (streaming) wasStreaming.current = true;
    else if (wasStreaming.current) {
      wasStreaming.current = false;
      onStreamEnd();
    }
  }, [streaming, onStreamEnd]);

  return (
    <section aria-label={name} style={s.column}>
      <header style={s.header}>
        <span style={s.tile}>
          <Icon.Cpu size={17} />
        </span>
        <div style={s.headText}>
          <div style={s.name}>{name}</div>
          <div className="mono tnum" style={s.meta}>
            {formatRunMeta(run)}
          </div>
        </div>
        {run.status === "done" && run.score != null && <CircularScore score={run.score} size={38} stroke={3} />}
      </header>

      <div style={s.body}>
        {running ? (
          <LiveLogStream log={eventsToLog(events)} running={streaming} height={LOG_HEIGHT} />
        ) : failed ? (
          <div style={s.failed}>
            <div style={s.failedLabel}>{run.status === "failed" ? t("results.failed") : t("results.cancelled")}</div>
            {run.error ?? t("results.noError")}
          </div>
        ) : findings.length === 0 ? (
          <p style={s.note}>{t("results.noFindings")}</p>
        ) : (
          findings.map((f) => {
            const sev = SEV[f.severity];
            const SevIcon = Icon[sev.icon];
            return (
              <div key={f.id} style={s.finding(sev.c)}>
                <SevIcon size={15} style={s.findingIcon(sev.c)} />
                <div>
                  <div style={s.findingTitle}>{f.title}</div>
                  <div className="mono" style={s.findingLoc}>
                    {f.file}:{f.start_line}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer style={s.footer}>
        <Button type="button" kind="tertiary" size="sm" onClick={() => onViewTrace(run.run_id)}>
          {t("results.viewTrace")}
        </Button>
        {run.status === "done" && <span style={s.count}>{t("results.findings", { count: findings.length })}</span>}
      </footer>
    </section>
  );
}
