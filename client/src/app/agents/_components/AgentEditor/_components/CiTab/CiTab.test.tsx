import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, CiInstallation } from "@devdigest/shared";
import ciMessages from "../../../../../../../messages/en/ci.json";
import agentsMessages from "../../../../../../../messages/en/agents.json";

vi.mock("../ExportCiWizard", () => ({
  ExportCiWizard: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      wizard
      <button onClick={onClose}>close wizard</button>
    </div>
  ),
}));

import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "d",
  provider: "openrouter",
  model: "openai/gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 3,
};

const INSTALLATION = (over: Partial<CiInstallation> = {}): CiInstallation => ({
  id: "i1",
  agent_id: "ag1",
  repo: "acme/payments-api",
  target_type: "gha",
  installed_at: "2026-10-01T10:00:00Z",
  agent_version: 3,
  latest_run: { verdict: "passed", ran_at: new Date(Date.now() - 4 * 60_000).toISOString() },
  ...over,
});

let installations: CiInstallation[];
let calls: { url: string; method?: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  installations = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      calls.push({ url: path, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const body = path.endsWith("/ci/installations") ? installations : { ...AGENT };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages, agents: agentsMessages }}>
        <CiTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiTab", () => {
  it("EC-13: without installations it says so, keeps Add to CI and shows no badge", async () => {
    renderTab();
    expect(await screen.findByText("Not deployed to CI yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to CI/ })).toBeInTheDocument();
    expect(screen.queryByText(/Active in/)).not.toBeInTheDocument();
  });

  it("AC-18, AC-21, AC-22, EC-12: lists installations with version, latest verdict and a View runs link", async () => {
    installations = [
      INSTALLATION(),
      INSTALLATION({ id: "i2", repo: "acme/billing-worker", agent_version: 2, latest_run: null }),
    ];
    renderTab();
    expect(await screen.findByText("Active in 2 repos")).toBeInTheDocument();
    const first = screen.getByText("acme/payments-api").closest("li")!;
    expect(within(first).getByText("GitHub Actions")).toBeInTheDocument();
    expect(within(first).getByText("v3")).toBeInTheDocument();
    expect(within(first).getByText("Passed")).toBeInTheDocument();
    expect(within(first).getByText("4m ago")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "View runs" })).toHaveAttribute("href", "/ci-runs");
    const second = screen.getByText("acme/billing-worker").closest("li")!;
    expect(within(second).getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add repository/ })).toBeInTheDocument();
  });

  it("AC-1: Add to CI and + Add repository open the wizard", async () => {
    installations = [INSTALLATION()];
    renderTab();
    await screen.findByText("acme/payments-api");
    fireEvent.click(screen.getByRole("button", { name: /Add to CI/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close wizard"));
    fireEvent.click(screen.getByRole("button", { name: /Add repository/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("AC-23: the Fail CI on select offers never, critical, warning and any", async () => {
    renderTab();
    await screen.findByText("Not deployed to CI yet");
    const values = within(screen.getByRole("combobox")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["never", "critical", "warning", "any"]);
  });

  it("AC-23: Fail CI on saves ci_fail_on through the agent update and shows the hint", async () => {
    renderTab();
    await screen.findByText("Not deployed to CI yet");
    expect(screen.getByText("A change reaches CI after the next “Add to CI”.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "warning" } });
    await waitFor(() =>
      expect(calls).toContainEqual({ url: "/agents/ag1", method: "PUT", body: { ci_fail_on: "warning" } }),
    );
  });
});
