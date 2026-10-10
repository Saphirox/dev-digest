import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingGroup, FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";
import { DisagreementBlock } from "./DisagreementBlock";
import { rowTitle, findingsById } from "./helpers";

afterEach(cleanup);

const RUN = (id: string, name: string, status = "done"): RunSummary =>
  ({ run_id: `run-${id}`, agent_id: id, agent_name: name, status }) as RunSummary;
const F = (id: string, severity: FindingRecord["severity"], title: string, line: number): FindingRecord =>
  ({ id, severity, title, file: "src/middleware/ratelimit.ts", start_line: line }) as FindingRecord;
const review = (agent: string, findings: FindingRecord[]): ReviewRecord =>
  ({ run_id: `run-${agent}`, agent_id: agent, findings }) as ReviewRecord;
const group = (members: [string, string][], conflict: boolean, start = 28): FindingGroup => ({
  file: "src/middleware/ratelimit.ts",
  start_line: start,
  end_line: start,
  conflict,
  members: members.map(([finding_id, agent]) => ({ finding_id, agent_id: agent, run_id: `run-${agent}` })),
});

const RUNS = [RUN("sec", "Security"), RUN("perf", "Performance"), RUN("mentor", "Junior Mentor")];
const REVIEWS = [
  review("sec", []),
  review("perf", [F("p1", "WARNING", "Pipeline INCR+EXPIRE", 27)]),
  review("mentor", [F("m1", "SUGGESTION", "Extract magic number 3600", 28)]),
];
const GROUPS = [
  group([["p1", "perf"], ["m1", "mentor"]], true, 27),
  group([["p1", "perf"], ["m1", "mentor"]], false, 52),
];

function renderBlock(runs = RUNS, groups = GROUPS) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <DisagreementBlock runs={runs} reviews={REVIEWS} groups={groups} />
    </NextIntlClientProvider>,
  );
}

describe("DisagreementBlock", () => {
  it("AC-33/34/39: one row per group with a cell per participating agent; title = highest severity, line = smallest start", () => {
    renderBlock(RUNS, [GROUPS[0]!]);
    expect(screen.getByText("Where agents disagree")).toBeInTheDocument();
    // WARNING (Performance) outranks SUGGESTION (Junior Mentor) for the title; smallest start line is 27.
    expect(screen.getByText("src/middleware/ratelimit.ts:27")).toBeInTheDocument();
    expect(screen.getByText("Pipeline INCR+EXPIRE", { selector: "span" })).toBeInTheDocument();
    const cells = ["Security", "Performance", "Junior Mentor"].map((n) => screen.getByText(n).parentElement!);
    expect(within(cells[0]!).getByText("did not flag")).toBeInTheDocument();
    expect(within(cells[1]!).getByText("WARNING")).toBeInTheDocument();
    expect(within(cells[2]!).getByText("SUGGESTION")).toBeInTheDocument();
    expect(within(cells[2]!).getByText("Extract magic number 3600")).toBeInTheDocument();
  });

  it("NFR-6: the severity label in a cell comes from the message catalogue", () => {
    const custom = { ...messages, disagree: { ...messages.disagree, severity: { ...messages.disagree.severity, WARNING: "WARN-i18n" } } };
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgent: custom }}>
        <DisagreementBlock runs={RUNS} reviews={REVIEWS} groups={[GROUPS[0]!]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("WARN-i18n")).toBeInTheDocument();
    expect(screen.queryByText("WARNING")).not.toBeInTheDocument();
  });

  it("AC-35: Show only conflicts is off at first, lists every group, and filters locally when on", () => {
    renderBlock();
    expect(screen.getAllByText(/^src\/middleware\/ratelimit\.ts:/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("switch", { name: "Show only conflicts" }));
    expect(screen.getAllByText(/^src\/middleware\/ratelimit\.ts:/)).toHaveLength(1);
    expect(screen.getByText("src/middleware/ratelimit.ts:27")).toBeInTheDocument();
  });

  it("EC-9: a running or failed agent's cell shows its status instead of 'did not flag'", () => {
    const runs = [RUN("sec", "Security", "failed"), RUN("perf", "Performance"), RUN("mentor", "Junior Mentor")];
    renderBlock(runs, [GROUPS[0]!]);
    const cell = screen.getByText("Security").parentElement!;
    expect(within(cell).getByText("failed")).toBeInTheDocument();
    expect(within(cell).queryByText("did not flag")).not.toBeInTheDocument();
  });

  it("EC-10: fewer than two done runs shows the hint instead of rows", () => {
    const runs = [RUN("sec", "Security"), RUN("perf", "Performance", "running")];
    renderBlock(runs, [GROUPS[0]!]);
    expect(screen.getByText("Run two or more agents to compare")).toBeInTheDocument();
    expect(screen.queryByText(/^src\/middleware/)).not.toBeInTheDocument();
  });

  it("AC-39: a severity tie goes to the agent selected first", () => {
    const tie = [F("a", "WARNING", "From mentor", 30), F("b", "WARNING", "From performance", 31)];
    const runs = [RUN("perf", "Performance"), RUN("mentor", "Junior Mentor")];
    const reviews = [review("mentor", [tie[0]!]), review("perf", [tie[1]!])];
    const g = group([["a", "mentor"], ["b", "perf"]], true, 30);
    expect(rowTitle(g, runs, findingsById(reviews))).toEqual({ title: "From performance", line: 30 });
  });
});
