/* Route: /multi-agent/:id. Thin entry — the results live in MultiRunResults. */
"use client";

import { useParams } from "next/navigation";
import { MultiRunResults } from "./_components/MultiRunResults";

export default function MultiAgentResultsPage() {
  const { id } = useParams<{ id: string }>();
  return <MultiRunResults id={id} />;
}
