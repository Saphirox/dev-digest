/** PRs listed in the menu; the PR list page has the rest. */
export const MAX_PRS = 12;

/** Merged/closed PRs aren't offered: reviewing them is rarely what you want here. */
export const CLOSED_STATUSES = ["closed", "merged"] as const;
