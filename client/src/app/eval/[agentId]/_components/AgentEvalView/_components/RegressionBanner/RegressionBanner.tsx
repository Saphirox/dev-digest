/* RegressionBanner — warns when the latest done run dropped a metric by a point
   or more (AC-36): which metrics, by how many points, and on which version.
   An icon and words, so the warning never rests on its amber colour (NFR-6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalDashboard } from "@devdigest/shared";
import { s } from "./styles";

const LABEL = { recall: "recall", precision: "precision", citation_accuracy: "citation" } as const;

export function RegressionBanner({ regression }: { regression: NonNullable<EvalDashboard["regression"]> }) {
  const t = useTranslations("eval");
  const parts = regression.metrics.map((m) =>
    t("banner.dipped", { metric: t(`legend.${LABEL[m.metric]}`), points: Math.round(m.drop_pts * 10) / 10 }),
  );
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertTriangle size={16} aria-hidden="true" style={s.icon} />
      <span>
        <strong>{parts.join(", ")}</strong> {t("banner.onVersion", { version: regression.version })}
      </span>
    </div>
  );
}
