/* RunCostBadge — what one agent run cost, in the two shapes the studio needs. */
"use client";

import React from "react";
import { formatUsd } from "@/lib/format-usd";

/**
 * Two variants, because cost appears in two structurally different places:
 *
 *   compact — a standalone figure in the PR list's COST column.
 *   inline  — the tail of a timeline row's meta line, where cost is paired
 *             with the token count ("9,119 tok · $0.0013") rather than
 *             standing on its own.
 *
 * The run trace drawer deliberately does NOT use this component: it already
 * has a bordered `Stat` tile, and a badge inside a tile would duplicate the
 * frame and set the COST tile apart from DURATION/TOKENS/FINDINGS beside it.
 * The piece shared with the drawer is `formatUsd`, not the markup.
 *
 * An unknown cost renders "—" (see `formatUsd`), never "$0.00".
 */
export function RunCostBadge({
  cost,
  tokens,
  variant = "compact",
}: {
  cost: number | null | undefined;
  /** Combined in+out tokens; rendered only by the `inline` variant. */
  tokens?: number | null;
  variant?: "compact" | "inline";
}) {
  if (variant === "inline") {
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {tokens != null && `${tokens.toLocaleString()} tok · `}
        {formatUsd(cost)}
      </span>
    );
  }
  // `tnum` keeps the figures tabular so the column's decimal points line up.
  return (
    <span className="tnum" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
      {formatUsd(cost)}
    </span>
  );
}

export default RunCostBadge;
