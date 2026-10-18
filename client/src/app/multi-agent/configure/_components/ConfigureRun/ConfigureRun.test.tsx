import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentRunEstimate, PrMeta, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";

const push = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: { id: "repo1" } }) }));

const AGENT = (over: Partial<Agent>): Agent =>
  ({ id: "a1", name: "Security", description: "Finds secrets", enabled: true, ...over }) as Agent;
let agents: Agent[];
let estimates: AgentRunEstimate[];
let reviews: ReviewRecord[];
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents }),
  useAgentRunEstimates: () => ({ data: estimates }),
}));
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({
    data: [
      { id: "pr1", number: 482, title: "Add rate limiting", status: "open" },
      { id: "pr2", number: 400, title: "Old merged", status: "merged" },
    ] as PrMeta[],
  }),
}));
const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => ({ data: prId ? reviews : undefined }),
  useRunReview: () => ({ mutate, isPending: false }),
}));

import { ConfigureRun } from "./ConfigureRun";

beforeEach(() => {
  query = "";
  agents = [
    AGENT({ id: "a1", name: "Security", description: "Finds secrets" }),
    AGENT({ id: "a2", name: "Performance", description: "Finds slow code" }),
    AGENT({ id: "a3", name: "Architecture", description: "Checks layering", enabled: false }),
  ];
  estimates = [
    { agent_id: "a1", avg_duration_ms: 8200, avg_cost_usd: 0.06 },
    { agent_id: "a2", avg_duration_ms: null, avg_cost_usd: null },
  ];
  reviews = [{ id: "r1", agent_id: "a1", summary: "Two critical exposures.", findings: [] } as unknown as ReviewRecord];
});
afterEach(() => {
  cleanup();
  push.mockReset();
  mutate.mockReset();
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <ConfigureRun />
    </NextIntlClientProvider>,
  );
}
const runButton = () => screen.getByRole("button", { name: /Run multi-agent review/ });
const choosePr = () => fireEvent.change(screen.getByRole("combobox"), { target: { value: "pr1" } });
const box = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("ConfigureRun", () => {
  it("AC-13: without a PR it asks to pick one first and the run button is disabled", () => {
    renderPage();
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(runButton()).toBeDisabled();
    expect(screen.queryByText(/parallel fan-out/)).not.toBeInTheDocument();
  });

  it("AC-14/15/16/36/37: picking a PR lists every agent, enabled ones checked, with estimate, summary and footer", () => {
    renderPage();
    // Merged PRs are not offered.
    expect(screen.queryByRole("option", { name: /Old merged/ })).not.toBeInTheDocument();
    choosePr();

    expect(box(/Security/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Performance/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Architecture/)).toHaveAttribute("aria-checked", "false");
    // AC-36: stored review summary, else the description.
    expect(screen.getByText("Two critical exposures.")).toBeInTheDocument();
    expect(screen.queryByText("Finds secrets")).not.toBeInTheDocument();
    expect(screen.getByText("Finds slow code")).toBeInTheDocument();
    // AC-15 / NFR-3: a null estimate renders "—", never 0.
    expect(screen.getByText("8.2s · $0.0600")).toBeInTheDocument();
    expect(screen.getAllByText("— · —")).toHaveLength(2);
    // AC-16: max known duration, sum known cost.
    expect(runButton()).toHaveTextContent("Run multi-agent review (2)");
    expect(screen.getByText("≈ 8.2s · $0.0600 · parallel fan-out")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(box(/Architecture/)).toHaveAttribute("aria-checked", "true");
    expect(runButton()).toHaveTextContent("(3)");
  });

  it("AC-17/EC-12: runs the checked agents in list order, opens the results page; none checked disables it", () => {
    renderPage();
    choosePr();
    fireEvent.click(box(/Architecture/)); // check the third
    fireEvent.click(box(/Security/)); // uncheck the first
    fireEvent.click(runButton());

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ prId: "pr1", agentIds: ["a2", "a3"] });
    mutate.mock.calls[0]![1].onSuccess({ multi_agent_run_id: "m1" });
    expect(push).toHaveBeenCalledWith("/multi-agent/m1");

    fireEvent.click(box(/Performance/));
    fireEvent.click(box(/Architecture/));
    expect(screen.getByText("Pick at least one agent")).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it("AC-37: a ?pr= prefill starts with the enabled agents checked; re-picking a PR resets the selection", () => {
    query = "pr=pr1";
    renderPage();
    expect(box(/Security/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Architecture/)).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box(/Security/));
    expect(box(/Security/)).toHaveAttribute("aria-checked", "false");
    choosePr();
    expect(box(/Security/)).toHaveAttribute("aria-checked", "true");
  });

  it("EC-13: with no agents it links to create one", () => {
    agents = [];
    renderPage();
    choosePr();
    expect(screen.getByRole("link", { name: "No agents yet — create one" })).toHaveAttribute("href", "/agents");
  });
});
