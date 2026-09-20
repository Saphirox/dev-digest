import { TAB_KEYS } from "./constants";

/** The `?tab=` value if it names a tab, else Config. */
export function resolveTab(requested: string | null): string {
  return requested && TAB_KEYS.includes(requested) ? requested : "config";
}
