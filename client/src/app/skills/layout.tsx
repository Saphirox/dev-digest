import { SkillsLayout } from "./_components/SkillsLayout";

/* Layout for /skills and /skills/:id. Mounted once for the whole section, so
   the rail keeps its search and scroll while you move between skills. */
export default function SkillsSectionLayout({ children }: { children: React.ReactNode }) {
  return <SkillsLayout>{children}</SkillsLayout>;
}
