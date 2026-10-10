import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const AGENT = (id: string, name: string, enabled = true) => ({ id, name, model: "gpt-4.1", enabled }) as Agent;
let agents: Agent[];
let estimates: AgentRunEstimate[];
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents }),
  useAgentRunEstimates: () => ({ data: estimates }),
}));
const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

beforeEach(() => {
  agents = [AGENT("a1", "Security"), AGENT("a2", "Performance"), AGENT("a3", "Architecture", false)];
  estimates = [
    { agent_id: "a1", avg_duration_ms: 6200, avg_cost_usd: 0.06 },
    { agent_id: "a2", avg_duration_ms: null, avg_cost_usd: null },
  ];
});
afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsync.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const runBtn = () => screen.getByRole("button", { name: /Run multi-agent review/ });

describe("RunReviewDropdown", () => {
  it("renders the trigger label and keeps the picker closed", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
    expect(screen.queryByText("Pick agents to run")).not.toBeInTheDocument();
  });

  it("AC-18/37/41 / NFR-3: opening lists a checkbox row per agent (enabled checked), estimates, no 'Run all'", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    open();
    expect(screen.getByText("Pick agents to run")).toBeInTheDocument();
    expect(box(/Security/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Performance/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Architecture/)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("~6s")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2); // Performance (null) + Architecture (no estimate)
    expect(screen.queryByText(/Run all/)).not.toBeInTheDocument();
    expect(runBtn()).toHaveTextContent("Run multi-agent review (2)");

    fireEvent.click(screen.getByRole("button", { name: "Configure agents…" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("EC-12 / AC-37: Clear disables the run button; reopening checks the enabled agents again; outside click closes", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(runBtn()).toBeDisabled();
    expect(runBtn()).toHaveTextContent("(0)");

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Pick agents to run")).not.toBeInTheDocument();
    open();
    expect(box(/Security/)).toHaveAttribute("aria-checked", "true");
    expect(runBtn()).toBeEnabled();
  });

  it("AC-38: exactly one checked agent sends {agentIds:[id]} and stays on the page", async () => {
    mutateAsync.mockResolvedValue({ runs: [{ run_id: "run1" }] });
    const onRunStart = vi.fn();
    const onRunsStarted = vi.fn();
    const onRunSettled = vi.fn();
    renderWithIntl(<RunReviewDropdown prId="pr1" onRunStart={onRunStart} onRunsStarted={onRunsStarted} onRunSettled={onRunSettled} />);
    open();
    fireEvent.click(box(/Performance/));
    fireEvent.click(runBtn());

    await waitFor(() => expect(onRunSettled).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
    expect(onRunStart).toHaveBeenCalled();
    expect(onRunsStarted).toHaveBeenCalledWith(["run1"]);
    expect(push).not.toHaveBeenCalled();
  });

  it("AC-19: two or more checked agents send one POST with agentIds in list order and open the results page", async () => {
    mutateAsync.mockResolvedValue({ runs: [{ run_id: "r1" }, { run_id: "r2" }, { run_id: "r3" }], multi_agent_run_id: "m1" });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    open();
    fireEvent.click(box(/Architecture/)); // third, checked last
    fireEvent.click(runBtn());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/m1"));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2", "a3"] });
  });

  it("EC-13: with no agents it offers to create one", () => {
    agents = [];
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "No agents yet — create one" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("shows the merged warning inside the picker for a merged PR", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" warnMerged />);
    open();
    expect(screen.getByText("Already merged — review is informational")).toBeInTheDocument();
  });
});
