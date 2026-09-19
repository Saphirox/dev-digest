"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions. Thin route entry — the scan, the
   candidate cards and the create-skill modal live under _components/. */
export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
