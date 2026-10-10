import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";

let stream: { events: unknown[]; running: boolean };
const useRunEvents = vi.fn((ids: string[]) => {
  void ids;
  return stream;
});
vi.mock("@/lib/hooks/reviews", () => ({ useRunEvents: (ids: string[]) => useRunEvents(ids) }));

import { AgentColumn } from "./AgentColumn";

const RUN = (over: Partial<RunSummary> = {}): RunSummary =>
  ({
    run_id: "run1",
    agent_id: "a1",
    agent_name: "Security",
    status: "done",
    error: null,
    duration_ms: 8200,
    cost_usd: 0.06,
    score: 38,
    ...over,
  }) as RunSummary;
const FINDING = (over: Partial<FindingRecord> = {}): FindingRecord =>
  ({ id: "f1", severity: "CRITICAL", title: "Hardcoded Stripe secret key", file: "src/config.ts", start_line: 12, ...over }) as FindingRecord;
const REVIEW = (findings: FindingRecord[]): ReviewRecord => ({ run_id: "run1", findings }) as ReviewRecord;

beforeEach(() => {
  stream = { events: [], running: false };
});
afterEach(() => {
  cleanup();
  useRunEvents.mockClear();
});

function renderColumn(props: Partial<React.ComponentProps<typeof AgentColumn>> = {}) {
  const onViewTrace = vi.fn();
  const onStreamEnd = vi.fn();
  const ui = (p: Partial<React.ComponentProps<typeof AgentColumn>>) => (
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <AgentColumn run={RUN()} review={REVIEW([FINDING()])} onViewTrace={onViewTrace} onStreamEnd={onStreamEnd} {...props} {...p} />
    </NextIntlClientProvider>
  );
  const view = render(ui(props));
  return { ...view, onViewTrace, onStreamEnd, rerenderWith: (p: Partial<React.ComponentProps<typeof AgentColumn>>) => view.rerender(ui({ ...props, ...p })) };
}

describe("AgentColumn", () => {
  it("AC-22: a done run shows duration · cost, the score ring, its findings and View trace", () => {
    const { onViewTrace } = renderColumn();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("8.2s · $0.0600")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onViewTrace).toHaveBeenCalledWith("run1");
    // Not running: no stream is opened.
    expect(useRunEvents).toHaveBeenLastCalledWith([]);
  });

  it("EC-11: a done run with zero findings says so, unlike a failed run", () => {
    renderColumn({ review: REVIEW([]) });
    expect(screen.getByText("No findings")).toBeInTheDocument();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("AC-25 / NFR-3: a failed run shows its status and error, no ring, and — for an unknown cost", () => {
    renderColumn({ run: RUN({ status: "failed", error: "Provider key missing", score: null, cost_usd: null, duration_ms: null }), review: undefined });
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Provider key missing")).toBeInTheDocument();
    expect(screen.getByText("— · —")).toBeInTheDocument();
    expect(screen.queryByText("38")).not.toBeInTheDocument();
    expect(screen.queryByText(/finding/)).not.toBeInTheDocument();
  });

  it("AC-23/24 / EC-7: a running run streams its live log, and the stream ending asks the page to refetch", () => {
    stream = { events: [{ t: "00.10", kind: "info", msg: "Reading the diff" }], running: true };
    const { onStreamEnd, rerenderWith } = renderColumn({ run: RUN({ status: "running", score: null, cost_usd: null, duration_ms: null }), review: undefined });
    expect(useRunEvents).toHaveBeenLastCalledWith(["run1"]);
    expect(screen.getByText("Reading the diff")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
    expect(onStreamEnd).not.toHaveBeenCalled();

    stream = { events: stream.events, running: false };
    rerenderWith({});
    expect(onStreamEnd).toHaveBeenCalledTimes(1);
  });
});
