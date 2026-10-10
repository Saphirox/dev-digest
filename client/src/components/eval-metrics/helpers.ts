import type { EvalMetricName, EvalTrendPoint } from "@devdigest/shared";

/** Shown wherever a metric or cost is unknown. null is never 0 (EC-6, EC-12). */
export const NO_VALUE = "—";

/** Tile / line colour per metric (design: recall blue, precision green, citation amber). */
export const METRIC_COLOR: Record<EvalMetricName, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};

/** 0.8234 → "82%"; null/undefined/NaN → "—". */
export function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  return `${Math.round(v * 100)}%`;
}

export type DeltaDirection = "up" | "down" | "flat";

export interface FormattedDelta {
  /** Signed, e.g. "+4 pt" / "−2 pt" / "0 pt". */
  text: string;
  direction: DeltaDirection;
  /** Absolute change in percentage points, one decimal at most. */
  points: number;
}

/** A change in fraction (0.04) as signed percentage points; null → no delta to show. */
export function formatDelta(delta: number | null | undefined): FormattedDelta | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const signed = Math.round(delta * 1000) / 10;
  const points = Math.abs(signed);
  if (signed === 0) return { text: "0 pt", direction: "flat", points: 0 };
  return signed > 0
    ? { text: `+${points} pt`, direction: "up", points }
    : { text: `−${points} pt`, direction: "down", points };
}

/** The metric's values over the trend, skipping runs where it is unknown (never coerced to 0). */
export function sparkValues(trend: EvalTrendPoint[], metric: EvalMetricName): number[] {
  const out: number[] = [];
  for (const p of trend) {
    const v = p[metric];
    if (v != null) out.push(v);
  }
  return out;
}

/** ISO timestamp → "2026-05-29 09:14" in the viewer's time zone. */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "17/20", or "—" while the pass count is unknown (running / failed). */
export function formatPassed(passed: number | null | undefined, total: number): string {
  return passed == null ? NO_VALUE : `${passed}/${total}`;
}

/** Cost change between two runs as signed dollars; null if either cost is unknown (EC-12). */
export function formatCostDelta(
  from: number | null | undefined,
  to: number | null | undefined,
  format: (v: number) => string,
): { text: string; direction: DeltaDirection; amount: string } | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  const diff = to - from;
  const amount = format(Math.abs(diff));
  if (diff === 0) return { text: amount, direction: "flat", amount };
  return diff > 0
    ? { text: `+${amount}`, direction: "up", amount }
    : { text: `−${amount}`, direction: "down", amount };
}

/** Change between two metric values as a fraction; null if either is unknown. */
export function metricChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null) return null;
  return to - from;
}
