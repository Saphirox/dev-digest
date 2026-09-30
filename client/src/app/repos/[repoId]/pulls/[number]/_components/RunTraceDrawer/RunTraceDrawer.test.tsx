import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", skills_tokens: 42, memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

let current: RunTrace = TRACE;
vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: current, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  current = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("labels the skills block with the tokens it added", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Skills (dynamic) · +~42 tokens")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("AC-25: 'Specs read' lists each injected path with its tokens and a missing / truncated marker", () => {
    current = {
      ...TRACE,
      specs_read: ["specs/a.md", "specs/b.md"],
      project_context: [
        { path: "specs/a.md", tokens: 212, status: "included" },
        { path: "specs/b.md", tokens: null, status: "truncated" },
        { path: "specs/gone.md", tokens: null, status: "missing" },
        { path: "specs/late.md", tokens: 90, status: "dropped" },
      ],
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("≈ 212 tok")).toBeInTheDocument();
    expect(screen.getByText("truncated")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText("specs/gone.md")).toBeInTheDocument();
    // EC-2: an unknown count shows "—", never 0.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("≈ 0 tok")).not.toBeInTheDocument();
    // A dropped document is only in project_context, not in this row.
    expect(screen.queryByText("specs/late.md")).not.toBeInTheDocument();
  });

  it("AC-26: the project-context block is labelled with the tokens it added", () => {
    current = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, specs: "## Project context", specs_tokens: 317 } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context — attached specs (untrusted) · ≈ 317 tokens")).toBeInTheDocument();
  });

  it("AC-26: the project-context block has a Copy button and expands to the full specs text", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    current = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, specs: "FULL-SPECS-TEXT-BODY", specs_tokens: 5 } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("FULL-SPECS-TEXT-BODY")).not.toBeInTheDocument();
    const head = screen.getByText(/^Project context — attached specs/).closest("div")!;
    fireEvent.click(within(head).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("FULL-SPECS-TEXT-BODY");
    fireEvent.click(screen.getByText(/^Project context — attached specs/));
    expect(screen.getByText("FULL-SPECS-TEXT-BODY")).toBeInTheDocument();
  });

  it("AC-26 / EC-2: no token suffix when specs_tokens is unknown", () => {
    current = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, specs: "## Project context", specs_tokens: null } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
  });
});
