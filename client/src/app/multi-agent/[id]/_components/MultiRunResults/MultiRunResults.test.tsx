import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRun } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";
import prReview from "../../../../../../messages/en/prReview.json";

const push = vi.fn();
const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/run-trace-drawer", () => ({
  default: (p: { runId: string; running?: boolean; awaitTrace?: boolean }) => (
    <div>
      drawer:{p.runId}:running={String(!!p.running)}:await={String(!!p.awaitTrace)}
    </div>
  ),
}));
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

let state: { data?: MultiAgentRun; isLoading: boolean; isError: boolean };
const refetch = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useMultiRun: () => ({ ...state, refetch }),
  useRunEvents: () => ({ events: [], running: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MultiRunResults } from "./MultiRunResults";

const RAN = "2026-01-01T00:00:00.000Z";
const RUN = (id: string, name: string, over: object = {}) => ({
  run_id: id, agent_id: `ag-${id}`, agent_name: name, status: "done", error: null, score: 50,
  duration_ms: 6000, cost_usd: 0.04, ran_at: RAN, ...over,
});
function run(over: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "m1", pr_id: "pr1", pr_number: 482, pr_title: "Add rate limiting", ran_at: RAN,
    runs: [RUN("r1", "Security"), RUN("r2", "Performance", { duration_ms: 8000, cost_usd: null })],
    reviews: [], groups: [],
    ...over,
  } as unknown as MultiAgentRun;
}

beforeEach(() => {
  query = "";
  state = { data: run(), isLoading: false, isError: false };
});
afterEach(() => {
  cleanup();
  push.mockReset();
  replace.mockReset();
  refetch.mockReset();
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages, prReview }}>
      <MultiRunResults id="m1" />
    </NextIntlClientProvider>,
  );
}

describe("MultiRunResults", () => {
  it("AC-20/21: header shows counts, PR, wall clock and summed known cost; starts on Columns; Configure run prefills the PR", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Multi-Agent Review" })).toBeInTheDocument();
    expect(screen.getByText("2 selected agents · parallel")).toBeInTheDocument();
    expect(screen.getByText("#482", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
    // Wall clock = last child end (8 s) − parent start; cost sums the known ones only (NFR-3).
    expect(screen.getByText("2 agents · parallel · 8.0s total · $0.0400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByText("Where agents disagree")).toBeInTheDocument(); // AC-33: under Columns…

    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(push).toHaveBeenCalledWith("/multi-agent/configure?pr=pr1");

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(screen.queryByRole("region", { name: "Security" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Security/ })).toBeInTheDocument();
    expect(screen.getByText("Where agents disagree")).toBeInTheDocument(); // …and under Tabs
  });

  it("AC-28/29/31 / EC-14: View trace opens the drawer for exactly that run, awaiting the trace and live while running", () => {
    state = { data: run({ runs: [RUN("r1", "Security"), RUN("r2", "Performance", { status: "running" })] as never }), isLoading: false, isError: false };
    const { unmount } = renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "View trace" })[1]!);
    expect(replace).toHaveBeenCalledWith("/multi-agent/m1?trace=r2");
    unmount();

    query = "trace=r2";
    renderPage();
    expect(screen.getByText("drawer:r2:running=true:await=true")).toBeInTheDocument();
  });

  it("shows an error state with retry when the run cannot be loaded", () => {
    state = { isLoading: false, isError: true };
    renderPage();
    expect(screen.getByText("Could not load this multi-agent run.")).toBeInTheDocument();
  });
});
