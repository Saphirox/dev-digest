/* FindingsDot — a plain, non-clickable "has findings" marker (Decision 11:
   the per-file header dot and the group header's `● N` count). Not `Badge`:
   `Badge` silently drops `aria-label` (`client/INSIGHTS.md`, 2026-09-20). The
   whole span IS the accessible image; `count`, when given, is a visible
   duplicate of what the caller already folded into `label`. */
import { s } from "./styles";

export function FindingsDot({ label, count }: { label: string; count?: number }) {
  return (
    <span role="img" aria-label={label} style={s.wrap}>
      <span style={s.dot} />
      {count != null && <span style={s.count}>{count}</span>}
    </span>
  );
}
