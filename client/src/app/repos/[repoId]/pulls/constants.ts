import type { PrMeta } from "@/lib/types";

/** Constants for the PR list page (/repos/:repoId/pulls). */

/**
 * Review status → colour token + i18n label key (under `list.status`). Open PRs
 * carry a derived review status (needs_review / reviewed / stale); merged/closed
 * keep their GitHub merge state.
 */
export const STATUS_META: Record<string, { c: string; labelKey: string }> = {
  needs_review: { c: "var(--warn)", labelKey: "needs_review" },
  reviewed: { c: "var(--ok)", labelKey: "reviewed" },
  stale: { c: "var(--stale)", labelKey: "stale" },
  open: { c: "var(--warn)", labelKey: "open" },
  merged: { c: "var(--ok)", labelKey: "merged" },
  closed: { c: "var(--stale)", labelKey: "closed" },
};

/** Size bucket → colour token. */
export const SIZE_COLOR: Record<PrSize, string> = {
  S: "var(--ok)",
  M: "var(--warn)",
  L: "var(--crit)",
};

export type Column = { key: string; width: string; align?: "right" };

/**
 * The PR list's columns, in display order — the ONE source for the grid
 * template, the header row (i18n key under `list.columns`) and PRRow's cells.
 * PRRow builds a `Record<ColumnKey, ReactNode>`, so adding a column here
 * without its cell is a type error rather than every header silently shifting
 * off its cell.
 */
export const COLUMNS = [
  { key: "pullRequest", width: "1fr" },
  { key: "author", width: "132px" },
  { key: "size", width: "92px" },
  { key: "score", width: "60px" },
  { key: "findings", width: "120px" },
  { key: "status", width: "118px" },
  { key: "cost", width: "76px" },
  { key: "updated", width: "78px", align: "right" },
] as const satisfies readonly Column[];

export type ColumnKey = (typeof COLUMNS)[number]["key"];

/** Grid template shared by the header row and every PR row. */
export const GRID = COLUMNS.map((c) => c.width).join(" ");

/** Line-count thresholds for the S/M/L size bucket. */
export const SIZE_SMALL_MAX = 100;
export const SIZE_MEDIUM_MAX = 400;

/** Filter chips: status key + i18n label key (under `list.filter`). */
export const STATUS_FILTERS: { key: string; labelKey: string }[] = [
  { key: "all", labelKey: "all" },
  { key: "needs_review", labelKey: "needs_review" },
  { key: "reviewed", labelKey: "reviewed" },
  { key: "stale", labelKey: "stale" },
];

/** Number of skeleton rows shown while loading. */
export const SKELETON_ROWS = 4;

export type PrSize = "S" | "M" | "L";
export type SizeInfo = { size: PrSize; lines: number };

/** Re-exported for helpers that consume PrMeta. */
export type { PrMeta };
