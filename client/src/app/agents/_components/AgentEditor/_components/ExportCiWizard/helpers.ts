import type { CiTrigger } from "@devdigest/shared";
import { TRIGGERS } from "./constants";

/** Add or remove a trigger, keeping the canonical order. */
export function toggleTrigger(current: readonly CiTrigger[], trigger: CiTrigger): CiTrigger[] {
  const next = new Set(current);
  if (next.has(trigger)) next.delete(trigger);
  else next.add(trigger);
  return TRIGGERS.filter((t) => next.has(t));
}

/** Save a Blob as a file through a temporary object URL. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
