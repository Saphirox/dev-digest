"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context. Thin route entry — the file tree and the
   markdown preview live under _components/. */
export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={repoId} />;
}
