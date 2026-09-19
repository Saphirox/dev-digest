import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/agents.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../../lib/toast";

const deleteMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useDeleteAgent: () => ({ mutate: deleteMutate, isPending: false }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { ConfigTab } from "./ConfigTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x".repeat(1648), // 412 tokens at chars/4
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderTab(onDeleted = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <ToastProvider>
        <ConfigTab agent={AGENT} onDeleted={onDeleted} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onDeleted;
}

beforeEach(() => deleteMutate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConfigTab", () => {
  it("counts system prompt tokens against the budget", () => {
    renderTab();
    expect(screen.getByText("412 / 8,000 tokens")).toBeInTheDocument();
    expect(screen.getByText(/Loaded as the static system message/)).toBeInTheDocument();
  });

  it("Cancel restores the saved values", () => {
    renderTab();
    const name = screen.getByDisplayValue("Security Reviewer");
    fireEvent.change(name, { target: { value: "Renamed" } });
    expect(screen.getByDisplayValue("Renamed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();
  });

  it("deletes only after confirming in the modal, then calls onDeleted", () => {
    const onDeleted = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete agent" }));
    const [id, opts] = deleteMutate.mock.calls[0]!;
    expect(id).toBe("ag1");
    opts.onSuccess();
    expect(onDeleted).toHaveBeenCalled();
  });
});
