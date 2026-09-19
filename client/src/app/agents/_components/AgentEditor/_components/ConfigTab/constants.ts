import type { CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";

/** Selectable providers in the Config tab. */
export const PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];

/** Selectable review strategies (labels are i18n'd in the component). */
export const STRATEGY_VALUES: readonly ReviewStrategy[] = ["single-pass", "map-reduce", "auto"];

/** CI gate policy options — when a CI review blocks/fails (labels i18n'd). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

/** Output-schema options (only one supported in MVP). */
export const OUTPUT_SCHEMA_VALUE = "Standard findings JSON";

/** Soft budget for the system prompt; the counter turns amber above it. */
export const SYSTEM_PROMPT_TOKEN_BUDGET = 8000;
