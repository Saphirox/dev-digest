/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import type { PrMeta } from "@/lib/types";
import { COLUMNS, SIZE_COLOR, STATUS_META, type ColumnKey } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";
import { FindingsCell } from "./_components/FindingsCell";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  // One entry per column; keyed by ColumnKey so a column added to COLUMNS
  // without its cell here fails the typecheck. Rendered in COLUMNS order.
  const cells: Record<ColumnKey, React.ReactNode> = {
    pullRequest: (
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
    ),
    author: (
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
    ),
    size: (
      <div>
        <Badge color={SIZE_COLOR[size]} bg="transparent" style={s.sizeBadgeBorder(SIZE_COLOR[size])}>
          {size} · {lines}
        </Badge>
      </div>
    ),
    score: (
      <div style={s.scoreCell}>
        {pr.score != null ? (
          <CircularScore score={pr.score} size={34} stroke={3} />
        ) : (
          // null score ⇒ PR has never been reviewed
          <span style={s.muted}>—</span>
        )}
      </div>
    ),
    findings: <FindingsCell prId={pr.id} counts={pr.findings} />,
    status: (
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
    ),
    cost: (
      <div style={s.costCell}>
        <RunCostBadge cost={pr.cost_usd} />
      </div>
    ),
    updated: <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>,
  };
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      {COLUMNS.map((c) => (
        <React.Fragment key={c.key}>{cells[c.key]}</React.Fragment>
      ))}
    </div>
  );
}
