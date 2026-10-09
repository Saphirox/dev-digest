import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./_components/RunReviewMenu", () => ({ RunReviewMenu: () => null }));
vi.mock("./_components/EvalsTab", () => ({ EvalsTab: () => <div>evals tab body</div> }));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} onDeleted={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("AC-7: the Evals tab is listed and renders the Evals tab body instead of the Config form", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} onDeleted={() => {}} />);
    expect(screen.getByRole("button", { name: /Evals/ })).toBeInTheDocument();
    expect(screen.getByText("evals tab body")).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
  });
});
