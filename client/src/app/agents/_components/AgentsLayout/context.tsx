"use client";

import React from "react";
import type { AgentTemplate } from "../CreateAgentModal";

/** What the panes need from the Agents shell: opening the create modal. */
export interface AgentsShell {
  openCreate: (template?: AgentTemplate) => void;
}

export const AgentsShellContext = React.createContext<AgentsShell>({ openCreate: () => {} });

export function useAgentsShell(): AgentsShell {
  return React.useContext(AgentsShellContext);
}
