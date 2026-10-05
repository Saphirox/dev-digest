import type { SpecFile } from "@devdigest/shared";

export interface TreeGroup {
  /** Folder label with a trailing slash; empty for files at the repository root. */
  folder: string;
  files: { path: string; name: string }[];
}

/** Group the documents under their folder, in the order the list first reaches each folder. */
export function buildTree(files: SpecFile[]): TreeGroup[] {
  const groups = new Map<string, TreeGroup>();
  for (const f of files) {
    const i = f.path.lastIndexOf("/");
    const folder = i < 0 ? "" : f.path.slice(0, i + 1);
    const group = groups.get(folder) ?? { folder, files: [] };
    group.files.push({ path: f.path, name: f.path.slice(i + 1) });
    groups.set(folder, group);
  }
  return [...groups.values()];
}

/** The selected path if the list still has it, else the first document (none for an empty list). */
export function resolveSelected(files: SpecFile[], selected: string | null): string | null {
  return files.some((f) => f.path === selected) ? selected : (files[0]?.path ?? null);
}
