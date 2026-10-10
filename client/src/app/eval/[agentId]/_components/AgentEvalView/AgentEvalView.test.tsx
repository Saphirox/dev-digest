import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentVersion, EvalDashboard, EvalPeriod, EvalSuiteRun, EvalSuiteRunDetail } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/eval/ag1",
  useSearchParams: () => new URLSearchParams(search),
}));

const runEvalMutate = vi.fn();
const promoteMutate = vi.fn();
const periodsAsked: EvalPeriod[] = [];
let state: {
  agent: Agent;
  dashboard: EvalDashboard;
  runs: EvalSuiteRun[];
  versions: AgentVersion[] | undefined;
  details: Record<string, EvalSuiteRunDetail>;
  runEvalPending: boolean;
  promote: { isPending: boolean; isError: boolean; error: Error | null };
};

vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => ({ data: state.agent, isError: false, refetch: vi.fn() }),
  useAgentVersions: () => ({ data: state.versions }),
  usePromoteVersion: () => ({ mutate: promoteMutate, ...state.promote }),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalDashboard: (_id: string, period: EvalPeriod) => {
    periodsAsked.push(period);
    return { data: state.dashboard };
  },
  useAgentEvalRuns: () => ({ data: state.runs, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunAgentEvals: () => ({ mutate: runEvalMutate, isPending: state.runEvalPending }),
  useEvalRun: (id: string) => ({ data: state.details[id], isLoading: false, isError: false }),
}));

import { AgentEvalView } from "./AgentEvalView";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 7,
};

const at = (day: number, h = 9) => new Date(2026, 4, day, h, 14).toISOString();
const RUN = (over: Partial<EvalSuiteRun>): EvalSuiteRun => ({
  id: "r",
  agent_id: "ag1",
  agent_version: 1,
  status: "done",
  started_at: at(1),
  finished_at: at(1),
  recall: 0.8,
  precision: 0.9,
  citation_accuracy: 0.95,
  cases_passed: 16,
  cases_total: 20,
  cost_usd: 0.2,
  error: null,
  failing_case: null,
  model: "gpt-4.1",
  provider: "openai",
  ...over,
});
const DETAIL = (run: EvalSuiteRun, effective_prompt: string): EvalSuiteRunDetail => ({ ...run, effective_prompt, case_results: [] });
const SNAP = (version: number): AgentVersion => ({
  agent_id: "ag1",
  version,
  created_at: at(1),
  config: { provider: "openai", model: "gpt-4.1", system_prompt: "p", strategy: "single-pass", ci_fail_on: "critical", repo_intel: true, skills: [] },
});

const V7 = RUN({ id: "r7", agent_version: 7, started_at: at(29), recall: 0.82, precision: 0.91, citation_accuracy: 0.95, cases_passed: 17, cost_usd: 0.23 });
const V6 = RUN({ id: "r6", agent_version: 6, started_at: at(27, 16), recall: 0.78, precision: 0.93, citation_accuracy: 0.94, cases_passed: 16, cost_usd: 0.21 });
const V5 = RUN({ id: "r5", agent_version: 5, started_at: at(25), cost_usd: null });

beforeEach(() => {
  search = "";
  periodsAsked.length = 0;
  state = {
    agent: AGENT,
    dashboard: {
      agent_id: "ag1",
      cases_total: 20,
      current: { run_id: "r7", agent_version: 7, ran_at: at(29), recall: 0.82, precision: 0.91, citation_accuracy: 0.95, cases_passed: 17, cases_total: 20, cost_usd: 0.23 },
      delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
      trend: [
        { run_id: "r6", ran_at: at(27), agent_version: 6, recall: 0.78, precision: 0.93, citation_accuracy: 0.94 },
        { run_id: "r7", ran_at: at(29), agent_version: 7, recall: 0.82, precision: 0.91, citation_accuracy: 0.95 },
      ],
      recent_runs: [],
      regression: { version: 7, metrics: [{ metric: "precision", drop_pts: 2 }] },
    },
    runs: [V7, V6, V5],
    versions: [SNAP(7), SNAP(6), SNAP(5)],
    details: {
      r6: DETAIL(V6, "You are a reviewer.\nReturn 5 findings.\nCite lines."),
      r7: DETAIL(V7, "You are a reviewer.\nReturn 5 findings.\nFlag unused imports.\nCite lines."),
      r5: DETAIL(V5, "x"),
    },
    runEvalPending: false,
    promote: { isPending: false, isError: false, error: null },
  };
});
afterEach(() => {
  cleanup();
  [replace, runEvalMutate, promoteMutate].forEach((m) => m.mockReset());
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <AgentEvalView agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

const pick = (version: number) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`Select run v${version} `) }));

describe("AgentEvalView — page", () => {
  it("AC-42: names the agent, links back to all agents and asks for the dashboard of this agent", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
  });

  it("AC-18/NFR-6: tiles show the latest done run with a signed, labelled change", () => {
    renderView();
    expect(within(screen.getByTestId("metric-Recall")).getByText("82%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Recall: up 4 points" })).toHaveTextContent("+4 pt");
    expect(screen.getByRole("img", { name: "Precision: down 2 points" })).toHaveTextContent("−2 pt");
    expect(screen.getByRole("img", { name: "Citation accuracy: up 1 points" })).toHaveTextContent("+1 pt");
  });

  it("AC-37: the trend chart is labelled with one point per done run in the period; an empty period says so", () => {
    renderView();
    expect(screen.getByRole("img", { name: "Metric trend over 2 runs" })).toBeInTheDocument();
    cleanup();
    state.dashboard.trend = [];
    renderView();
    expect(screen.queryByRole("img", { name: /Metric trend over/ })).not.toBeInTheDocument();
    expect(screen.getByText("No finished runs in this period.")).toBeInTheDocument();
  });

  it("AC-38: each metric tile draws a sparkline from the done runs of the trend", () => {
    renderView();
    for (const name of ["Recall", "Precision", "Citation accuracy"]) {
      expect(screen.getByTestId(`metric-${name}`).querySelector("svg path")).not.toBeNull();
    }
  });

  it("AC-36: the banner names the dropped metric, the points and the version, and nothing else", () => {
    renderView();
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Precision dipped 2 pts");
    expect(banner).toHaveTextContent("v7");
    expect(banner).not.toHaveTextContent("Recall");
    expect(banner).not.toHaveTextContent("Citation");
  });

  it("AC-36: no banner without a regression", () => {
    state.dashboard.regression = null;
    renderView();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-19/EC-12: lists runs newest first with version, status, passed / total, and a dash for an unknown cost", () => {
    renderView();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("v7")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2026-05-29 09:14")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Done")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("17/20")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$0.230")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("—")).toBeInTheDocument();
    expect(within(rows[2]!).queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("EC-7/NFR-6: a failed run says failed and why, with dashes instead of scores; it cannot be selected", () => {
    state.runs = [RUN({ id: "bad", agent_version: 8, status: "failed", recall: null, precision: null, citation_accuracy: null, cases_passed: null, failing_case: "ssrf-webhook", error: "provider down" }), V7];
    renderView();
    const row = within(screen.getByTestId("run-bad"));
    expect(row.getByText("Failed")).toBeInTheDocument();
    expect(row.getByText("failed on “ssrf-webhook”")).toBeInTheDocument();
    expect(row.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(row.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("AgentEvalView — run and period", () => {
  it("AC-12: Run eval starts a suite run for this agent", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(runEvalMutate).toHaveBeenCalledWith("ag1");
  });

  it("AC-33: while a run is running the button is disabled and the status says running", () => {
    state.runs = [RUN({ id: "go", status: "running", recall: null, precision: null, citation_accuracy: null, cases_passed: null }), V7];
    renderView();
    expect(screen.getByRole("button", { name: /Running…/ })).toBeDisabled();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
  });

  it("AC-39: opens on 30 days, takes ?period=, and changing it rewrites the URL", () => {
    renderView();
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveValue("30d");
    expect(periodsAsked.at(-1)).toBe("30d");
    fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: "7d" } });
    expect(replace).toHaveBeenCalledWith("/eval/ag1?period=7d");
  });

  it("AC-39: an explicit ?period=all is used", () => {
    search = "period=all";
    renderView();
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveValue("all");
    expect(periodsAsked.at(-1)).toBe("all");
  });
});

describe("AgentEvalView — compare", () => {
  it("AC-20: Compare is enabled only while exactly two done runs are selected", () => {
    renderView();
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    pick(7);
    expect(compare).toBeDisabled();
    pick(6);
    expect(compare).toBeEnabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    pick(5);
    expect(compare).toBeDisabled();
  });

  it("AC-21: shows old, new and signed change for the metrics and cost, plus the prompt diff", () => {
    renderView();
    pick(7);
    pick(6);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Compare runs · v6 → v7")).toBeInTheDocument();
    const recall = within(dialog.getByTestId("compare-recall"));
    expect(recall.getByText("78%")).toBeInTheDocument();
    expect(recall.getByText("82%")).toBeInTheDocument();
    expect(recall.getByRole("img", { name: "Recall: up 4 points" })).toHaveTextContent("+4 pt");
    expect(within(dialog.getByTestId("compare-precision")).getByRole("img", { name: "Precision: down 2 points" })).toHaveTextContent("−2 pt");
    const cost = within(dialog.getByTestId("compare-cost"));
    expect(cost.getByText("$0.210")).toBeInTheDocument();
    expect(cost.getByText("$0.230")).toBeInTheDocument();
    expect(cost.getByRole("img", { name: "Cost: up $0.0200" })).toHaveTextContent("+$0.0200");
    expect(dialog.getByText("+ Flag unused imports.")).toBeInTheDocument();
    expect(dialog.queryByText("The prompt did not change between these runs.")).not.toBeInTheDocument();
  });

  it("EC-12: an unknown cost is a dash in the compare view and has no delta", () => {
    renderView();
    pick(7);
    pick(5);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const cost = within(screen.getByTestId("compare-cost"));
    expect(cost.getAllByText("—")).toHaveLength(1);
    expect(cost.queryByRole("img")).not.toBeInTheDocument();
  });

  it("AC-21: models and providers are shown only where they differ", () => {
    state.details.r6 = { ...state.details.r6!, model: "gpt-4o" };
    state.runs = [V7, { ...V6, model: "gpt-4o" }, V5];
    renderView();
    pick(7);
    pick(6);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByText("Model: gpt-4o → gpt-4.1")).toBeInTheDocument();
    expect(screen.queryByText(/Provider:/)).not.toBeInTheDocument();
  });

  it("EC-13: identical prompts say the prompt did not change instead of an empty diff", () => {
    state.details.r7 = DETAIL(V7, "same prompt");
    state.details.r6 = DETAIL(V6, "same prompt");
    renderView();
    pick(7);
    pick(6);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByText("The prompt did not change between these runs.")).toBeInTheDocument();
  });

  it("EC-16: Promote of the current version is disabled and says so; an older one promotes", () => {
    renderView();
    pick(7);
    pick(6);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = within(screen.getByRole("dialog"));
    const v7 = dialog.getByRole("button", { name: "Promote v7" });
    expect(v7).toBeDisabled();
    expect(dialog.getByText("v7 is already the current version.")).toBeInTheDocument();
    const v6 = dialog.getByRole("button", { name: "Promote v6" });
    expect(v6).toBeEnabled();
    fireEvent.click(v6);
    expect(promoteMutate).toHaveBeenCalledWith(6, expect.anything());
  });

  it("EC-25: a version with no saved snapshot cannot be promoted, with the reason", () => {
    state.versions = [SNAP(7)];
    renderView();
    pick(7);
    pick(6);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Promote v6" })).toBeDisabled();
    expect(dialog.getByText("v6 has no saved configuration to restore.")).toBeInTheDocument();
  });

  it("AC-40: a refused promote (409) shows its message in the modal", () => {
    state.promote = { isPending: false, isError: true, error: new Error("skills no longer exist: lint-rules") };
    renderView();
    pick(7);
    pick(6);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("skills no longer exist: lint-rules");
  });

  it("NFR-5: select, open and close by keyboard — focus moves into the modal and back to Compare", () => {
    renderView();
    const first = screen.getByRole("checkbox", { name: /Select run v7 / });
    first.focus();
    expect(document.activeElement).toBe(first);
    pick(7);
    pick(6);
    const compare = screen.getByRole("button", { name: "Compare" });
    compare.focus();
    fireEvent.click(compare); // Enter / Space on a button fire click
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toHaveTextContent("Close");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(compare);
  });
});
