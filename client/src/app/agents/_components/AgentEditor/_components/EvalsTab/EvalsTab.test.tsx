import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalCase, EvalCaseResult, EvalDashboard, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../../messages/en/common.json";

// Data hooks, mocked by their exact module path: state is set per test.
const runAllMutate = vi.fn();
const runCaseMutate = vi.fn();
const removeMutate = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();
type Mut = { isPending: boolean; error: Error | null; variables?: unknown; data?: unknown };
const idle = (): Mut => ({ isPending: false, error: null });
let state: {
  cases: EvalCase[];
  runs: EvalSuiteRun[];
  dashboard: EvalDashboard | null;
  runAll: Mut;
  create: Mut;
  update: Mut;
  runCase: Mut;
};

vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => ({ data: state.cases, isLoading: false, isError: false }),
  useAgentEvalRuns: () => ({ data: state.runs }),
  useAgentEvalDashboard: () => ({ data: state.dashboard ?? undefined }),
  useRunAgentEvals: () => ({ mutate: runAllMutate, ...state.runAll }),
  useRunEvalCase: () => ({ mutate: runCaseMutate, ...state.runCase }),
  useDeleteEvalCase: () => ({ mutate: removeMutate, isPending: false }),
  useCreateEvalCase: () => ({ mutate: createMutate, ...state.create }),
  useUpdateEvalCase: () => ({ mutate: updateMutate, ...state.update }),
}));

import { EvalsTab } from "./EvalsTab";

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

const RESULT = (over: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  id: "res1",
  case_id: "c1",
  suite_run_id: "run1",
  case_name: "stripe-key-leak",
  expected_output: { kind: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 },
  pass: true,
  expected_count: 1,
  produced_count: 1,
  kept_count: 1,
  dropped_count: 0,
  findings: [],
  duration_ms: 1800,
  cost_usd: 0.02,
  ran_at: "2026-10-01T10:00:00Z",
  ...over,
});

const CASE = (over: Partial<EvalCase> = {}): EvalCase => ({
  id: "c1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  input_diff: "diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,6 +10,7 @@\n+  stripeKey: 1",
  input_files: null,
  input_meta: null,
  expected_output: { kind: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 },
  notes: null,
  created_at: "2026-10-01T09:00:00Z",
  source_finding_id: null,
  title: "Hardcoded Stripe secret key",
  severity: "CRITICAL",
  category: "security",
  latest_result: RESULT(),
  ...over,
});

const DASHBOARD: EvalDashboard = {
  agent_id: "ag1",
  cases_total: 3,
  current: {
    run_id: "run1",
    agent_version: 7,
    ran_at: "2026-10-01T10:00:00Z",
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: null,
    cases_passed: 3,
    cases_total: 5,
    cost_usd: null,
  },
  delta: { recall: 0.04, precision: -0.02, citation_accuracy: null },
  trend: [],
  recent_runs: [],
  regression: null,
};

const RUN = (status: EvalSuiteRun["status"]): EvalSuiteRun => ({
  id: "run2",
  agent_id: "ag1",
  agent_version: 7,
  status,
  started_at: "2026-10-01T11:00:00Z",
  finished_at: null,
  recall: null,
  precision: null,
  citation_accuracy: null,
  cases_passed: null,
  cases_total: 3,
  cost_usd: null,
  error: null,
  failing_case: null,
  model: "gpt-4.1",
  provider: "openai",
});

beforeEach(() => {
  state = {
    cases: [
      CASE(),
      CASE({
        id: "c2",
        name: "missing-retry-after",
        severity: "WARNING",
        category: "bug",
        latest_result: RESULT({ id: "res2", case_id: "c2", pass: false, expected_count: 1, produced_count: 0 }),
      }),
      CASE({ id: "c3", name: "service-role-in-client", latest_result: null }),
    ],
    runs: [],
    dashboard: DASHBOARD,
    runAll: idle(),
    create: idle(),
    update: idle(),
    runCase: idle(),
  };
});
afterEach(() => {
  cleanup();
  [runAllMutate, runCaseMutate, removeMutate, createMutate, updateMutate].forEach((m) => m.mockReset());
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
      <EvalsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const row = (id: string) => within(screen.getByTestId(`eval-case-${id}`));

describe("EvalsTab — listing", () => {
  it("AC-7/NFR-6: each case shows its type and passed / failed / never run as a word, with expected vs produced", () => {
    renderTab();
    expect(row("c1").getByText("Passed")).toBeInTheDocument();
    expect(row("c1").getByText("must find")).toBeInTheDocument();
    expect(row("c1").getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(row("c1").getByText("CRITICAL · security")).toBeInTheDocument();
    expect(row("c2").getByText("Failed")).toBeInTheDocument();
    expect(row("c2").getByText("expected 1 finding, got 0")).toBeInTheDocument();
    expect(row("c3").getAllByText("never run")).toHaveLength(2);
  });

  it("EC-24: a case whose source finding is gone (source_finding_id null) shows no source-finding link", () => {
    state.cases = [CASE({ source_finding_id: null })];
    renderTab();
    expect(row("c1").getByText("stripe-key-leak")).toBeInTheDocument();
    expect(row("c1").queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit case stripe-key-leak" }));
    expect(within(screen.getByRole("dialog")).queryByRole("link")).not.toBeInTheDocument();
  });

  it("AC-8: shows the passed count of the latest finished run", () => {
    renderTab();
    expect(screen.getByText("3 / 5 passing")).toBeInTheDocument();
  });

  it("AC-18/EC-6/EC-12: tiles show the latest run with signed deltas, and a dash for an unknown metric", () => {
    renderTab();
    expect(within(screen.getByTestId("metric-Recall")).getByText("82%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Recall: up 4 points" })).toHaveTextContent("+4 pt");
    expect(screen.getByRole("img", { name: "Precision: down 2 points" })).toHaveTextContent("−2 pt");
    expect(within(screen.getByTestId("metric-Citation accuracy")).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-Cases passed")).getByText("3/5")).toBeInTheDocument();
  });

  it("AC-42: links to the agent's eval page", () => {
    renderTab();
    expect(screen.getByRole("link", { name: /View full dashboard/ })).toHaveAttribute("href", "/eval/ag1");
  });

  it("EC-5: an empty set shows the empty state and disables Run all evals", () => {
    state.cases = [];
    state.dashboard = null;
    renderTab();
    expect(screen.getByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run all evals/ })).toBeDisabled();
    expect(screen.queryByText(/passing/)).not.toBeInTheDocument();
  });
});

describe("EvalsTab — running", () => {
  it("AC-12: Run all evals starts a suite run for this agent", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Run all evals/ }));
    expect(runAllMutate).toHaveBeenCalledWith("ag1");
  });

  it("AC-33: while a run is running the tab says so and disables every run button", () => {
    state.runs = [RUN("running")];
    renderTab();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Running…/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case stripe-key-leak" })).toBeDisabled();
  });

  it("AC-34: a case's run control runs just that case", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Run case missing-retry-after" }));
    expect(runCaseMutate).toHaveBeenCalledWith("c2");
  });
});

describe("EvalsTab — delete", () => {
  it("AC-29/AC-30: asks for confirmation naming the case, then deletes", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete case stripe-key-leak" }));
    expect(removeMutate).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/“stripe-key-leak”/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
    expect(removeMutate).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("AC-30: cancelling deletes nothing", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete case stripe-key-leak" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(removeMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("EvalsTab — case modal", () => {
  it("AC-26/EC-20: a new case needs a name, a diff and parseable JSON; Save sends them", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /New eval case/ }));
    const dialog = within(screen.getByRole("dialog"));
    const save = dialog.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: "new-case" } });
    fireEvent.change(dialog.getByLabelText("Diff"), { target: { value: "diff --git a/x b/x" } });
    expect(dialog.getByText("valid JSON")).toBeInTheDocument();
    expect(save).toBeEnabled();

    fireEvent.change(dialog.getByLabelText("Expected output"), { target: { value: "{ not json" } });
    expect(dialog.getByText("invalid JSON")).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(dialog.getByLabelText("Expected output"), {
      target: { value: '{"kind":"must_not_flag","file":"x","start_line":1,"end_line":2}' },
    });
    fireEvent.click(save);
    expect(createMutate).toHaveBeenCalledWith(
      {
        name: "new-case",
        input_diff: "diff --git a/x b/x",
        expected_output: { kind: "must_not_flag", file: "x", start_line: 1, end_line: 2 },
      },
      expect.anything(),
    );
  });

  it("AC-27/AC-28: editing shows the diff read-only, the last result, and saves name + expectation only", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit case stripe-key-leak" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Input diff (read-only)")).toHaveTextContent("+ stripeKey: 1");
    expect(dialog.queryByLabelText("Diff")).not.toBeInTheDocument();
    const last = within(dialog.getByTestId("case-last-result"));
    expect(last.getByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByTestId("case-last-result")).toHaveTextContent("expected 1 finding, got 1 · 1.8s · $0.02");

    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: "renamed" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "c1",
        patch: {
          name: "renamed",
          expected_output: { kind: "must_find", file: "src/config.ts", start_line: 12, end_line: 12 },
        },
      },
      expect.anything(),
    );
  });

  it("EC-12: an unknown cost in the last result is a dash, never $0.00", () => {
    state.cases = [CASE({ latest_result: RESULT({ cost_usd: null }) })];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit case stripe-key-leak" }));
    expect(screen.getByTestId("case-last-result")).toHaveTextContent("1.8s · —");
    expect(screen.getByTestId("case-last-result")).not.toHaveTextContent("$0.00");
  });

  it("AC-5/EC-18: a server 422 shows its message in the modal", () => {
    state.update = { isPending: false, error: new Error("expectation file is not in the diff") };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit case stripe-key-leak" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("expectation file is not in the diff");
  });
});
