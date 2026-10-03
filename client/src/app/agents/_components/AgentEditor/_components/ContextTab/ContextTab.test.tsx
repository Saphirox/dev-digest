import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import contextMessages from "../../../../../../../messages/en/context.json";
import agentsMessages from "../../../../../../../messages/en/agents.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({ useUpdateAgent: () => ({ mutate }) }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "repo1" }) }));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => ({
    data: {
      cloned: true,
      files: [
        { path: "specs/security-baseline.md", type: "specs", tokens: 212 },
        { path: "specs/public-api.md", type: "specs", tokens: 105 },
        { path: "docs/architecture.md", type: "docs", tokens: null },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useContextFile: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const AGENT = {
  id: "ag1",
  name: "Security Reviewer",
  context_paths: ["specs/security-baseline.md", "specs/public-api.md"],
} as Agent;

function renderTab(agent: Agent = AGENT) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages, agents: agentsMessages }}>
      <ContextTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

describe("agent ContextTab", () => {
  it("AC-7: header reads 'Project context' with '<attached> of <total> attached'", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
  });

  it("AC-12: footer shows the attached tokens with ≈ and the injection note", () => {
    renderTab();
    expect(screen.getByText("≈ 317 tokens")).toBeInTheDocument();
    expect(screen.getByText(/Injected as an untrusted block/)).toBeInTheDocument();
  });

  it("AC-9: ticking a document saves the ordered context_paths through the agent update", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("context-row-docs/architecture.md")).getByRole("checkbox"));
    expect(mutate).toHaveBeenCalledWith(
      { id: "ag1", patch: { context_paths: ["specs/security-baseline.md", "specs/public-api.md", "docs/architecture.md"] } },
      expect.any(Object),
    );
  });

  it("AC-10 / NFR-7: moving a row with the keyboard saves the new order", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: /public-api\.md: drag, or press/ }), { key: "ArrowUp" });
    expect(mutate).toHaveBeenCalledWith(
      { id: "ag1", patch: { context_paths: ["specs/public-api.md", "specs/security-baseline.md"] } },
      expect.any(Object),
    );
  });

  it("shows the ticks from the agent's saved context_paths and treats an absent field as none", () => {
    renderTab({ ...AGENT, context_paths: undefined });
    expect(screen.getByText("0 of 3 attached")).toBeInTheDocument();
  });
});
