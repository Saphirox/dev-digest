"use client";

import { useParams } from "next/navigation";
import { SkillsLayout } from "../_components/SkillsLayout";

/* Route: /skills/:id (Skill editor). Thin route entry — same layout as
   /skills with this skill open; the tab lives in ?tab=. */
export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillsLayout skillId={id} />;
}
