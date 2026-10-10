import type { IconName } from "@devdigest/ui";
import type { CiFailOn } from "@devdigest/shared";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Stats arrives with a later lesson. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "Folder" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "ci", labelKey: "editor.tabs.ci", icon: "Workflow" },
];

export const TAB_KEYS = TABS.map((tb) => tb.key);

/** CI gate policy options — when a CI review blocks/fails (labels i18n'd). Used by the Config and CI tabs. */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
