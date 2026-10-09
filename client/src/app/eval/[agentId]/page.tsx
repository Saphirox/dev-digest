import { AgentEvalView } from "./_components/AgentEvalView";

/* Route: /eval/:agentId. Thin route entry — one agent's eval runs live in
   _components/AgentEvalView. `params` is async in Next 15. */
export default async function AgentEvalPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentEvalView agentId={agentId} />;
}
