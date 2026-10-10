import type { CiExportInputBody, CiTrigger } from "@devdigest/shared";

export type CiPostAs = NonNullable<CiExportInputBody["post_as"]>;
export type CiAction = NonNullable<CiExportInputBody["action"]>;

/** `pull_request` event types the workflow can react to (canonical order). */
export const TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

/** "Post results as" options (labels are i18n'd). */
export const POST_AS_VALUES: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];

/** Wizard steps, in order (labels i18n'd under `exportWizard.steps`). */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

export const ZIP_FILENAME = "devdigest-ci.zip";
