import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";
import prReview from "../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({ useFindingAction: () => ({ mutate, isPending: false }) }));
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

import { AgentTabs } from "./AgentTabs";

const RUNS = [
  { run_id: "run1", agent_name: "Security", status: "done", score: 38, duration_ms: 8200, cost_usd: 0.06, error: null },
  { run_id: "run2", agent_name: "Performance", status: "done", score: 64, duration_ms: null, cost_usd: null, error: null },
  { run_id: "run3", agent_name: "Architecture", status: "failed", score: null, duration_ms: null, cost_usd: null, error: "Provider key missing" },
] as RunSummary[];
const F = (id: string, title: string): FindingRecord =>
  ({
    id, severity: "CRITICAL", category: "security", title, file: "src/config.ts", start_line: 12, end_line: 12,
    rationale: "Because.", suggestion: null, confidence: 0.9, kind: "finding", accepted_at: null, dismissed_at: null,
  }) as unknown as FindingRecord;
const REVIEWS = [
  { run_id: "run1", summary: "Two critical exposures.", findings: [F("f1", "Hardcoded Stripe secret key")] },
  { run_id: "run2", summary: "N+1 will bite.", findings: [F("f2", "N+1 query")] },
] as ReviewRecord[];

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderTabs(onChanged = vi.fn(), onViewTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages, prReview }}>
      <AgentTabs prId="pr1" runs={RUNS} reviews={REVIEWS} onViewTrace={onViewTrace} onChanged={onChanged} />
    </NextIntlClientProvider>,
  );
  return onChanged;
}

describe("AgentTabs", () => {
  it("AC-26/27: one tab per agent; the selected tab shows its summary card and findings; Accept hits that one finding", () => {
    const onChanged = renderTabs();
    expect(screen.getByRole("button", { name: /Security\s*38/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Performance\s*64/ })).toBeInTheDocument();
    // First tab selected: summary card + its finding (expanded).
    expect(screen.getByText("Two critical exposures.")).toBeInTheDocument();
    expect(screen.getByText("8.2s · $0.0600")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ findingId: "f1", action: "accept", prId: "pr1" });
    mutate.mock.calls[0]![1].onSuccess();
    expect(onChanged).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Performance/ }));
    expect(screen.getByText("N+1 will bite.")).toBeInTheDocument();
    expect(screen.getByText("— · —")).toBeInTheDocument(); // NFR-3
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
  });

  it("AC-25: a failed agent's tab shows its status and error, no ring", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("button", { name: /Architecture/ }));
    expect(screen.getByText(/Failed — Provider key missing/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
  });

  it("AC-28: View trace on the summary card opens the trace of the selected tab's run", () => {
    const onViewTrace = vi.fn();
    renderTabs(vi.fn(), onViewTrace);
    fireEvent.click(screen.getByRole("button", { name: /Performance/ }));
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onViewTrace).toHaveBeenCalledTimes(1);
    expect(onViewTrace).toHaveBeenCalledWith("run2");
  });
});
