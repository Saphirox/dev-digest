export type AgoUnit = "now" | "m" | "h" | "d";

/** An ISO timestamp as a coarse "N units ago" the component renders via i18n. */
export function relativeTime(iso: string, now: number = Date.now()): { unit: AgoUnit; n: number } {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return { unit: "now", n: 0 };
  if (minutes < 60) return { unit: "m", n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "h", n: hours };
  return { unit: "d", n: Math.floor(hours / 24) };
}
