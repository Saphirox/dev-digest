import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";

let agents: Agent[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgent: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));
vi.mock("../CreateAgentModal", async (orig) => ({
  ...(await orig<typeof import("../CreateAgentModal")>()),
  CreateAgentModal: ({ template }: { template?: string }) => <div>create-modal:{template ?? "scratch"}</div>,
}));

import { AgentsLayout } from "./AgentsLayout";
import { AgentsIndexPane } from "../AgentsIndexPane";

const AGENT = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets",
  model: "gpt-4.1",
  enabled: true,
  skill_count: 3,
} as Agent;

function renderLayout() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentsLayout>
        <AgentsIndexPane />
      </AgentsLayout>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  agents = [];
});
afterEach(cleanup);

describe("AgentsLayout + AgentsIndexPane (/agents)", () => {
  it("shows the empty state with both actions and a bare rail when there are no agents", () => {
    renderLayout();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start from template" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Agent" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search agents…")).not.toBeInTheDocument();
  });

  it("opens the shell's create modal from the empty state", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Create your first agent" }));
    expect(screen.getByText("create-modal:scratch")).toBeInTheDocument();
  });

  it("starts from a template through the same modal", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Start from template" }));
    fireEvent.click(screen.getByText("Mentor Reviewer"));
    expect(screen.getByText("create-modal:Mentor")).toBeInTheDocument();
  });

  it("with agents: rail cards, search, Add Agent, and a select prompt", () => {
    agents = [AGENT, { ...AGENT, id: "ag2", name: "Performance Reviewer", description: "N+1" }];
    renderLayout();
    expect(screen.getByText("Select an agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Agent" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search agents…"), { target: { value: "perf" } });
    expect(screen.queryByRole("button", { name: "Security Reviewer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Performance Reviewer" })).toBeInTheDocument();
  });
});
