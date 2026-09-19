import type { PrMeta } from "@devdigest/shared";
import { CLOSED_STATUSES, MAX_PRS } from "./constants";

/** Open PRs that have a DB id (needed to start a run), newest number first. */
export function openPulls(pulls: PrMeta[]): (PrMeta & { id: string })[] {
  return pulls
    .filter((p): p is PrMeta & { id: string } => !!p.id && !(CLOSED_STATUSES as readonly string[]).includes(p.status))
    .sort((a, b) => b.number - a.number)
    .slice(0, MAX_PRS);
}
