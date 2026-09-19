import { AgentsIndexPane } from "./_components/AgentsIndexPane";

/* Route: /agents. Thin route entry — the right pane only (empty state or
   "select an agent"); the rail lives in ./layout.tsx. */
export default function AgentsPage() {
  return <AgentsIndexPane />;
}
