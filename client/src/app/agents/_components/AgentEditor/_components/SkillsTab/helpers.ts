import type { AgentSkillDetail, Skill } from "@devdigest/shared";
import type { AgentSkillEntry } from "../../../../../../lib/hooks/skills";

/**
 * Pure list operations for the Skills tab. The tab lists EVERY workspace skill.
 * The enabled links come first: they are the prompt, in prompt order, and only
 * they can be dragged. Disabled links and unlinked skills follow. The checkbox
 * is the link's `enabled`; saving links every row.
 */

/** Enabled links in order, then disabled links in order, then unlinked skills by name. */
export function buildRows(linked: AgentSkillDetail[], all: Skill[]): AgentSkillDetail[] {
  const byId = new Map(all.map((sk) => [sk.id, sk]));
  const links: AgentSkillDetail[] = linked.map((l) => ({ ...l, ...(byId.get(l.id) ?? {}) }));
  const rows = [...links.filter((l) => l.link_enabled), ...links.filter((l) => !l.link_enabled)];
  const unlinked = all
    .filter((sk) => !linked.some((l) => l.id === sk.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const sk of unlinked) rows.push({ ...sk, order: rows.length, link_enabled: false });
  return reindex(rows);
}

/** Re-number `order` after any change so the optimistic list matches the server. */
export function reindex(rows: AgentSkillDetail[]): AgentSkillDetail[] {
  return rows.map((r, i) => (r.order === i ? r : { ...r, order: i }));
}

/**
 * Move the enabled row `id` to `toIndex`, clamped to the enabled block. A
 * disabled row, or no move, returns the same array.
 */
export function moveTo(rows: AgentSkillDetail[], id: string, toIndex: number): AgentSkillDetail[] {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0 || !rows[from]!.link_enabled) return rows;
  const to = Math.max(0, Math.min(countEnabled(rows) - 1, toIndex));
  if (from === to) return rows;
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row!);
  return reindex(next);
}

/**
 * Tick or untick a row. Ticking appends it to the end of the enabled block (the
 * end of the prompt); unticking moves it just below the block.
 */
export function setLinkEnabled(
  rows: AgentSkillDetail[],
  id: string,
  enabled: boolean,
): AgentSkillDetail[] {
  const row = rows.find((r) => r.id === id);
  if (!row) return rows;
  const rest = rows.filter((r) => r.id !== id);
  const next = [...rest];
  next.splice(countEnabled(rest), 0, { ...row, link_enabled: enabled });
  return reindex(next);
}

/** The request body for `POST /agents/:id/skills`: every row, in order. */
export function toEntries(rows: AgentSkillDetail[]): AgentSkillEntry[] {
  return rows.map((r) => ({ skill_id: r.id, enabled: r.link_enabled }));
}

/** Rows ticked for this agent (the "N of M enabled" chip). */
export function countEnabled(rows: AgentSkillDetail[]): number {
  return rows.filter((r) => r.link_enabled).length;
}

export function filterRows(rows: AgentSkillDetail[], query: string): AgentSkillDetail[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.type.includes(q));
}
