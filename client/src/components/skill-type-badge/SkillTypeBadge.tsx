/* SkillTypeBadge — a skill's type as a coloured chip (Skills page, agent Skills tab). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_COLORS } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const { color, bg } = TYPE_COLORS[type];
  return (
    <Badge color={color} bg={bg}>
      {t(`listItem.type.${type}`)}
    </Badge>
  );
}
