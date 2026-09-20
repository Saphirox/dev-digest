"use client";

import { useParams } from "next/navigation";
import { AgentEditorPane } from "../_components/AgentEditorPane";

/* Route: /agents/:id. Thin route entry — the agent's editor in the right pane;
   the rail lives in ../layout.tsx. */
export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <AgentEditorPane agentId={id} />;
}
