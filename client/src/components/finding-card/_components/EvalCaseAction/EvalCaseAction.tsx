/* EvalCaseAction — "Turn into eval case" on a finding card. Shown only once the
   finding is decided: an accepted finding becomes a must_find case and a
   dismissed one a must_not_flag case in one click (the server derives the kind
   from the decision, so none is sent). Once the API answers (created, or the
   finding already had a case) the button gives way to "Eval case · <kind>".
   A refusal (no agent, no diff, diff changed…) shows its reason inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalExpectationKind, FindingRecord } from "@devdigest/shared";
import { useCreateEvalCaseFromFinding } from "@/lib/hooks/evals";
import { s } from "./styles";

export function EvalCaseAction({ finding }: { finding: FindingRecord }) {
  const t = useTranslations("prReview");
  const create = useCreateEvalCaseFromFinding();
  const [made, setMade] = React.useState<EvalExpectationKind | null>(null);
  const decided = !!finding.accepted_at || !!finding.dismissed_at;

  if (!decided) return null;

  if (made) {
    return (
      <span style={s.done} role="status">
        <Icon.FlaskConical size={14} aria-hidden="true" />
        {t("finding.evalCase.done", { kind: t(`finding.evalCase.kind.${made}`) })}
      </span>
    );
  }

  return (
    <span style={s.wrap}>
      <Button
        type="button"
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        loading={create.isPending}
        onClick={() =>
          create.mutate(
            { findingId: finding.id },
            { onSuccess: (res) => setMade(res.case.expected_output.kind) },
          )
        }
      >
        {t("finding.evalCase.action")}
      </Button>
      {create.isError && (
        <span role="alert" style={s.error}>
          {create.error.message}
        </span>
      )}
    </span>
  );
}
