import { NO_VALUE } from "@/components/eval-metrics";

/** 41250 → "41 s", 125000 → "2m 5s"; null/unknown → "—". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return NO_VALUE;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}
