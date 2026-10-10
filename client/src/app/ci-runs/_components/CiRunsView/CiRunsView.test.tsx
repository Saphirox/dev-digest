import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CiRefreshResult, CiRun } from "@devdigest/shared";
import ciMessages from "../../../../../messages/en/ci.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

const RUN = (over: Partial<CiRun> = {}): CiRun => ({
  id: "r1",
  repo: "acme/payments-api",
  pr_number: 128,
  agent_name: "Security Reviewer",
  verdict: "passed",
  findings_count: 3,
  cost_usd: 0.0123,
  duration_ms: 41250,
  job_url: "https://github.com/acme/payments-api/actions/runs/9912345",
  ran_at: "2026-10-01T10:00:00Z",
  ...over,
});

let runs: CiRun[];
let refreshResponse: () => Response;
let calls: string[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  runs = [];
  calls = [];
  refreshResponse = () => json({ ingested: 0, failed_repos: [] } satisfies CiRefreshResult);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/ci/runs/refresh") return refreshResponse();
      if (path === "/ci/runs") return json(runs);
      throw new Error(`unexpected fetch ${path}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiRunsView", () => {
  it("AC-30, AC-31: shows the runs table with a PR link, verdict, findings, cost, duration and job link", async () => {
    runs = [RUN(), RUN({ id: "r2", verdict: "changes_requested", pr_number: 130 })];
    renderView();
    const link = await screen.findAllByRole("link", { name: "#128" });
    expect(link[0]).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/128");
    for (const col of ["Repository", "PR", "Agent", "Verdict", "Findings", "Cost", "Duration", "Job"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    const first = screen.getAllByRole("row")[1]!;
    expect(within(first).getByText("Passed")).toBeInTheDocument();
    expect(within(first).getByText("3")).toBeInTheDocument();
    expect(within(first).getByText("$0.0123")).toBeInTheDocument();
    expect(within(first).getByText("41 s")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "View job" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/actions/runs/9912345",
    );
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
  });

  it("AC-32: refreshes when the page opens and on Refresh, then reloads the list", async () => {
    runs = [RUN()];
    renderView();
    await screen.findByText("Security Reviewer");
    await waitFor(() => expect(calls.filter((c) => c === "POST /ci/runs/refresh")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() => expect(calls.filter((c) => c === "POST /ci/runs/refresh")).toHaveLength(2));
    await waitFor(() => expect(calls.filter((c) => c === "GET /ci/runs").length).toBeGreaterThanOrEqual(2));
  });

  it("EC-10: with no runs it shows the empty state and no table", async () => {
    renderView();
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.getByText("Once you export an agent to CI, every automated review shows up here.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("EC-11, EC-14: unknown cost shows — not $0.00 and a deleted agent shows —", async () => {
    runs = [RUN({ cost_usd: null, agent_name: null, findings_count: null, duration_ms: null, job_url: null })];
    renderView();
    await screen.findByText("Passed");
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).queryByText("$0.00")).not.toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("EC-15: when GitHub cannot be refreshed the stored runs stay and a notice says so", async () => {
    runs = [RUN()];
    refreshResponse = () => json({ ingested: 0, failed_repos: ["acme/payments-api"] });
    renderView();
    expect(await screen.findByText("Security Reviewer")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("acme/payments-api");

    cleanup();
    refreshResponse = () => json({ error: { code: "github_down", message: "down" } }, 502);
    renderView();
    expect(await screen.findByText("Security Reviewer")).toBeInTheDocument();
    expect(await screen.findByText(/Could not refresh CI runs from GitHub/)).toBeInTheDocument();
  });

  it("only github.com job links are rendered as links", async () => {
    runs = [RUN({ job_url: "javascript:alert(1)" })];
    renderView();
    await screen.findByText("Passed");
    expect(screen.queryByRole("link", { name: "View job" })).not.toBeInTheDocument();
  });
});
