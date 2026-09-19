"use client";

import { useParams } from "next/navigation";
import { SkillPane } from "../_components/SkillPane";

/* Route: /skills/:id (Skill editor). Thin route entry — this skill open in the
   pane; the rail comes from app/skills/layout.tsx and the tab lives in ?tab=. */
export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillPane skillId={id} />;
}
