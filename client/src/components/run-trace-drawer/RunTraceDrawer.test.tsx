import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../messages/en/runs.json";

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
// Most tests stub the trace hook; the EC-14 ones run the real hook against a stubbed fetch.
let realTraceHook = false;
vi.mock("@/lib/hooks/trace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/trace")>("@/lib/hooks/trace");
  return {
    useRunTrace: (...args: Parameters<typeof actual.useRunTrace>) =>
      realTraceHook ? actual.useRunTrace(...args) : { data: current, isLoading: false },
  };
});
let live: { events: unknown[]; running: boolean } = { events: [], running: false };
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => live,
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  current = TRACE;
  realTraceHook = false;
  live = { events: [], running: false };
  vi.unstubAllGlobals();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("AC-32: with the PR page's props (no awaitTrace) it renders the trace tabs and stats unchanged", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("AC-30: a completed run opened from the results page shows the same sections as on the PR page", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} awaitTrace onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("Prompt assembly")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy raw output/ })).toBeEnabled();
    fireEvent.click(screen.getByText("log"));
    expect(screen.getByText("Citation grounding: 2/2 passed")).toBeInTheDocument();
  });

  it("AC-31: a failed run's drawer still opens and its log shows the run's error", () => {
    current = {
      ...TRACE,
      raw_output: "",
      log: [
        { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
        { t: "00.40", kind: "error", msg: "LLM call failed (400ms): No API key for anthropic" },
      ],
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} awaitTrace onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    fireEvent.click(screen.getByText("log"));
    expect(screen.getByText("LLM call failed (400ms): No API key for anthropic")).toBeInTheDocument();
  });

  it("AC-29: a running run opens on the live log tab and shows the streamed events", () => {
    live = {
      running: true,
      events: [{ type: "log", run_id: "r1", t: 0.4, kind: "info", msg: "Reading src/config.ts" }],
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} running onClose={() => {}} />);
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
    expect(screen.getByText("Reading src/config.ts")).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
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

  describe("EC-14: a just-finished run's trace is saved a moment after it ends", () => {
    function stubTraceFetch() {
      realTraceHook = true;
      const notFound = () =>
        new Response(JSON.stringify({ error: { code: "not_found", message: "no trace" } }), { status: 404 });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(notFound())
        .mockResolvedValue(new Response(JSON.stringify(TRACE), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }
    function renderRealHook(ui: React.ReactElement) {
      const qc = new QueryClient();
      return renderWithIntl(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
    }

    it("awaitTrace keeps the loading note through a 404, then shows the trace", async () => {
      const fetchMock = stubTraceFetch();
      renderRealHook(<RunTraceDrawer runId="r1" agentName="Security" awaitTrace onClose={() => {}} />);
      expect(await screen.findByText("Loading trace…")).toBeInTheDocument();
      expect(await screen.findByText("2/2 passed", {}, { timeout: 4000 })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("without awaitTrace a 404 settles at once on the no-trace note", async () => {
      const fetchMock = stubTraceFetch();
      renderRealHook(<RunTraceDrawer runId="r1" agentName="Security" onClose={() => {}} />);
      expect(await screen.findByText(messages.drawer.noTrace)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
