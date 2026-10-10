/* PeriodFilter — 7 days / 30 days / 90 days / all time. A native select, so it
   works from the keyboard and screen readers as-is. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalPeriod } from "@devdigest/shared";
import { PERIODS, parsePeriod } from "../../helpers";
import { s } from "./styles";

export function PeriodFilter({ value, onChange }: { value: EvalPeriod; onChange: (p: EvalPeriod) => void }) {
  const t = useTranslations("eval");
  return (
    <label style={s.wrap}>
      <Icon.Calendar size={14} aria-hidden="true" style={s.icon} />
      <select
        aria-label={t("period.label")}
        value={value}
        onChange={(e) => onChange(parsePeriod(e.target.value))}
        style={s.select}
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {t(`period.${p}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
