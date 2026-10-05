import type { SpecDocType, SpecFile } from "@devdigest/shared";

/**
 * Pure list operations for the project-context picker. `value` is the ordered
 * list of attached repo-relative paths (the same shape the API stores). Rows are
 * the attached paths first, in that order, then every other document in list
 * order; only attached rows can be moved.
 */

export interface ContextRow {
  path: string;
  /** File name, e.g. `security-baseline.md`. */
  name: string;
  /** Containing folder with a trailing slash, e.g. `specs/`; empty at the repo root. */
  folder: string;
  /** `null` for an attached path the list no longer has. */
  type: SpecDocType | null;
  /** `null` when unknown (never 0). */
  tokens: number | null;
  attached: boolean;
  /** Attached but absent from the list. */
  missing: boolean;
}

export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i + 1) };
}

/** Attached paths in stored order (absent ones as `missing`), then the unattached documents. */
export function buildRows(files: SpecFile[], value: string[]): ContextRow[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const attached = new Set(value);
  const row = (path: string, file: SpecFile | undefined): ContextRow => ({
    path,
    ...splitPath(path),
    type: file?.type ?? null,
    tokens: file?.tokens ?? null,
    attached: attached.has(path),
    missing: !file,
  });
  return [
    ...[...attached].map((p) => row(p, byPath.get(p))),
    ...files.filter((f) => !attached.has(f.path)).map((f) => row(f.path, f)),
  ];
}

/** Move the attached `path` to `toIndex` (clamped to the attached block). No move returns the same array. */
export function moveTo(value: string[], path: string, toIndex: number): string[] {
  const from = value.indexOf(path);
  if (from < 0) return value;
  const to = Math.max(0, Math.min(value.length - 1, toIndex));
  if (from === to) return value;
  const next = [...value];
  next.splice(from, 1);
  next.splice(to, 0, path);
  return next;
}

/** Tick or untick a path. Ticking appends it (the end of the injected block); a ticked path is never added twice. */
export function toggle(value: string[], path: string, on: boolean): string[] {
  if (on) return value.includes(path) ? value : [...value, path];
  return value.filter((p) => p !== path);
}

/** Case-insensitive "path contains". */
export function filterRows(rows: ContextRow[], query: string): ContextRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/**
 * Tokens the attached documents add: the sum of the known counts. Unknown counts
 * are left out, and `null` (shown as "—") means attached documents exist but
 * none has a known count — never 0.
 */
export function sumTokens(rows: ContextRow[]): number | null {
  const attached = rows.filter((r) => r.attached);
  if (attached.length === 0) return 0;
  const known = attached.filter((r) => r.tokens != null);
  if (known.length === 0) return null;
  return known.reduce((sum, r) => sum + (r.tokens ?? 0), 0);
}
