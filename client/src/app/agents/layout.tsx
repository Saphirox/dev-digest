"use client";

import { AgentsLayout } from "./_components/AgentsLayout";

/* Layout for /agents and /agents/:id. Mounted once for the whole section, so
   the rail (and its order) survives moving between agents; a reload resets it. */
export default function AgentsSectionLayout({ children }: { children: React.ReactNode }) {
  return <AgentsLayout>{children}</AgentsLayout>;
}
