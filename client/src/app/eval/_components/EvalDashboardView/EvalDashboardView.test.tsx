import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalOverview, EvalOverviewAgent, EvalOverviewRun, EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const runAllMutate = vi.fn();
let overview: { data?: EvalOverview; isLoading: boolean; isError: boolean };
let runAllState: { isPending: boolean; data?: unknown };
vi.mock("@/lib/hooks/evals", () => ({
  useEvalOverview: () => ({ ...overview, refetch: vi.fn() }),
  useRunAllAgentEvals: () => ({ mutate: runAllMutate, ...runAllState }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

const RUN = (over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id: "run1",
  agent_id: "ag1",
  agent_version: 7,
  status: "done",
  started_at: new Date(2026, 4, 29, 9, 14).toISOString(),
  finished_at: new Date(2026, 4, 29, 9, 20).toISOString(),
  recall: 0.82,
  precision: 0.91,
  citation_accuracy: 0.95,
  cases_passed: 17,
  cases_total: 20,
  cost_usd: 0.23,
  error: null,
  failing_case: null,
  model: "gpt-4.1",
  provider: "openai",
  ...over,
});

const AGENT = (over: Partial<EvalOverviewAgent> = {}): EvalOverviewAgent => ({
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  model: "gpt-4.1",
  provider: "openai",
  cases_total: 20,
  latest_run: RUN(),
  trend: [
    { run_id: "a", ran_at: "2026-05-27T00:00:00Z", agent_version: 6, recall: 0.78, precision: 0.93, citation_accuracy: 0.94 },
    { run_id: "run1", ran_at: "2026-05-29T00:00:00Z", agent_version: 7, recall: 0.82, precision: 0.91, citation_accuracy: 0.95 },
  ],
  ...over,
});

const RECENT = (over: Partial<EvalOverviewRun> = {}): EvalOverviewRun => ({ ...RUN(), agent_name: "Security Reviewer", ...over });

beforeEach(() => {
  overview = {
    isLoading: false,
    isError: false,
    data: {
      agents: [
        AGENT(),
        AGENT({
          agent_id: "ag2",
          agent_name: "Performance Reviewer",
          model: "gpt-4o",
          cases_total: 18,
          latest_run: RUN({ id: "run2", agent_id: "ag2", agent_version: 4, recall: null, precision: null, citation_accuracy: null, status: "failed", cases_passed: null, error: "boom", failing_case: "n-plus-one" }),
          trend: [],
        }),
        AGENT({
          agent_id: "ag3",
          agent_name: "Custom Mentor",
          model: "gpt-4o-mini",
          latest_run: RUN({ id: "run3", agent_id: "ag3", status: "running", recall: null, precision: null, citation_accuracy: null, cases_passed: null }),
          trend: [],
        }),
      ],
      recent_runs: [
        RECENT(),
        RECENT({ id: "run2", agent_name: "Performance Reviewer", agent_id: "ag2", agent_version: 4, status: "failed", recall: null, precision: null, citation_accuracy: null, cases_passed: null }),
      ],
    },
  };
  runAllState = { isPending: false };
});
afterEach(() => {
  cleanup();
  runAllMutate.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

describe("EvalDashboardView", () => {
  it("AC-23: one row per agent with model, latest run version, time, passed / total and the three metrics", () => {
    renderView();
    const list = within(screen.getByRole("list", { name: "Agents" }));
    expect(list.getAllByRole("listitem")).toHaveLength(3);
    const row = within(list.getAllByRole("listitem")[0]!);
    expect(row.getByText("Security Reviewer")).toBeInTheDocument();
    expect(row.getByText("gpt-4.1")).toBeInTheDocument();
    expect(row.getByText("v7 · 2026-05-29 09:14")).toBeInTheDocument();
    expect(row.getByText("17/20 pass")).toBeInTheDocument();
    expect(row.getByText("82%")).toBeInTheDocument();
    expect(row.getByText("91%")).toBeInTheDocument();
    expect(row.getByText("95%")).toBeInTheDocument();
  });

  it("AC-38: an agent with two or more done runs gets a sparkline", () => {
    renderView();
    const rows = within(screen.getByRole("list", { name: "Agents" })).getAllByRole("listitem");
    expect(rows[0]!.querySelector("svg path")).not.toBeNull();
  });

  it("AC-25: an agent row opens that agent's eval page", () => {
    renderView();
    const link = within(screen.getAllByRole("listitem")[0]!).getByRole("link");
    expect(link).toHaveAttribute("href", "/eval/ag1");
  });

  it("EC-7: a failed run is labelled failed with dashes, never low scores", () => {
    renderView();
    const row = within(screen.getAllByRole("listitem")[1]!);
    expect(row.getByText("Failed")).toBeInTheDocument();
    expect(row.getByText("on case “n-plus-one”")).toBeInTheDocument();
    expect(row.getAllByText("—")).toHaveLength(3);
    expect(row.queryByText("0%")).not.toBeInTheDocument();
  });

  it("AC-35: a running agent's row shows Running", () => {
    renderView();
    expect(within(screen.getAllByRole("listitem")[2]!).getByText("Running")).toBeInTheDocument();
  });

  it("AC-24: lists recent runs with agent, time, version, status and passed / total; failed ones say failed", () => {
    renderView();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // header + 2 runs
    expect(rows).toHaveLength(3);
    const first = within(rows[1]!);
    expect(first.getByText("Security Reviewer")).toBeInTheDocument();
    expect(first.getByText("2026-05-29 09:14")).toBeInTheDocument();
    expect(first.getByText("v7")).toBeInTheDocument();
    expect(first.getByText("Done")).toBeInTheDocument();
    expect(first.getByText("17/20")).toBeInTheDocument();
    const failed = within(rows[2]!);
    expect(failed.getByText("Failed")).toBeInTheDocument();
    expect(failed.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("AC-35: Run all agents starts every agent shown", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(runAllMutate).toHaveBeenCalledWith(["ag1", "ag2", "ag3"]);
  });

  it("EC-19: an agent whose run was refused with a 409 reads 'already running'; the others carry on", () => {
    runAllState = {
      isPending: false,
      data: [
        { agentId: "ag1", status: "started" },
        { agentId: "ag2", status: "started" },
        { agentId: "ag3", status: "already_running" },
      ],
    };
    renderView();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[2]!).getByText("already running")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("already running")).not.toBeInTheDocument();
  });

  it("shows an empty state when no agent has eval cases, and disables Run all agents", () => {
    overview.data = { agents: [], recent_runs: [] };
    renderView();
    expect(screen.getByText("No agents with eval cases yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeDisabled();
  });
});
