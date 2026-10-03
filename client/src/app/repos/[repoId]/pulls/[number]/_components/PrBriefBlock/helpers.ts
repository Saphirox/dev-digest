import type { BlastRadius } from "@devdigest/shared";

/** `path`, `path:n` or `path:a-b` — the text of a file reference. */
export function formatFileRef(file: string, start?: number, end?: number): string {
  if (start == null) return file;
  if (end == null || end === start) return `${file}:${start}`;
  return `${file}:${start}-${end}`;
}

/** A file the PR adds: its patch's only hunk starts from an empty old side. */
export function isNewFile(patch: string | null | undefined): boolean {
  return patch?.startsWith("@@ -0,0 ") ?? false;
}

export type RefTarget = "pr" | "blast";

/** A ref to a file of the PR opens on Files changed; any other validated ref
 *  is a blast-map file and links out to GitHub. */
export function refTarget(file: string, prPaths: ReadonlySet<string>): RefTarget {
  return prPaths.has(file) ? "pr" : "blast";
}

/** The commit a blast-only ref is linked at: the repo-intel index's own SHA,
 *  else the PR head. */
export function blobSha(blast: Pick<BlastRadius, "indexed_sha"> | null | undefined, headSha: string): string {
  return blast?.indexed_sha ?? headSha;
}

/** A token count in the brief's compact form: `8200` -> `8.2K`, `950` -> `950`.
 *  Zero stays `0` — only a null count is unknown, and the caller omits those. */
export function formatTokenCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}
