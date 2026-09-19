import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";

/** Accepted first, then pending, rejected last; by confidence inside each. */
export function sortConventions(list: ConventionCandidate[]): ConventionCandidate[] {
  const rank = { accepted: 0, pending: 1, rejected: 2 } as const;
  return [...list].sort((a, b) => rank[a.status] - rank[b.status] || b.confidence - a.confidence);
}

/** Categories present in the list, with counts, in first-seen order. */
export function categoryCounts(list: ConventionCandidate[]): [ConventionCategory, number][] {
  const counts = new Map<ConventionCategory, number>();
  for (const c of list) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  return [...counts];
}

/** "3 of 4 accepted": rejected ones don't count toward the total. */
export function acceptedStats(list: ConventionCandidate[]): { accepted: number; total: number } {
  const live = list.filter((c) => c.status !== "rejected");
  return { accepted: live.filter((c) => c.status === "accepted").length, total: live.length };
}

/** "1 hour ago" style, from an ISO timestamp. */
export function timeAgo(iso: string, now = Date.now(), locale = "en"): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

/**
 * Items in a frozen id order, so accepting or rejecting doesn't move cards
 * until the next scan or reload. Ids missing from the order go last.
 */
export function applyFrozenOrder<T extends { id: string }>(items: T[], order: string[] | null): T[] {
  if (!order) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}
