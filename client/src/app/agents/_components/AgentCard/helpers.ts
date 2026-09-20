import { MODEL_COLOR } from "./constants";

/**
 * The model as the card shows it: the last path segment of a routed id
 * (`deepseek/deepseek-v4-flash` → `deepseek-v4-flash`). The full id goes in the
 * chip's tooltip.
 */
export function shortModel(model: string): string {
  return model.slice(model.lastIndexOf("/") + 1);
}

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[shortModel(model)] ?? "var(--text-secondary)";
}
