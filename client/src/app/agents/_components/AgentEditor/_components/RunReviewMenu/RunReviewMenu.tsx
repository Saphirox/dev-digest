/* RunReviewMenu — "Run Review ▾" in the agent editor header: pick one of the
   active repo's open PRs, start THIS agent on it (disabled agents included),
   and open the PR to watch the run. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useActiveRepo } from "../../../../../../lib/repo-context";
import { usePulls } from "../../../../../../lib/hooks/core";
import { useRunReview } from "../../../../../../lib/hooks/reviews";
import { openPulls } from "./helpers";

export function RunReviewMenu({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const { data: pulls } = usePulls(activeRepo?.id);
  const run = useRunReview();
  const prs = openPulls(pulls ?? []);

  const items: DropdownItemDef[] =
    activeRepo && prs.length > 0
      ? prs.map((pr) => ({
          label: `#${pr.number} ${pr.title}`,
          icon: "GitPullRequest",
          hint: pr.author,
          onClick: () =>
            run.mutate(
              { prId: pr.id, agentId },
              { onSuccess: () => router.push(`/repos/${activeRepo.id}/pulls/${pr.number}`) },
            ),
        }))
      : [
          {
            label: t("editor.runReviewNoPrs"),
            icon: "GitPullRequest",
            muted: true,
            onClick: () => router.push(activeRepo ? `/repos/${activeRepo.id}/pulls` : "/"),
          },
        ];

  return (
    <Dropdown
      width={340}
      align="right"
      trigger={
        <Button kind="secondary" size="sm" icon="Sparkles" iconRight="ChevronDown" loading={run.isPending}>
          {t("editor.runReview")}
        </Button>
      }
      items={items}
    />
  );
}
