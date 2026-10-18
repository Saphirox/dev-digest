import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, CiFile } from "@devdigest/shared";
import ciMessages from "../../../../../../../messages/en/ci.json";

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
}));

import { ExportCiWizard } from "./ExportCiWizard";

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

const WORKFLOW = ".github/workflows/devdigest-review.yml";
const FILES: CiFile[] = [
  { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer", editable: false },
  { path: ".devdigest/skills/secret-leakage-gate.md", contents: "# skill body", editable: false },
  { path: ".devdigest/runner/index.js", contents: "// runner", editable: false },
  { path: WORKFLOW, contents: "name: DevDigest Review", editable: true },
];

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[];
let handlers: Record<string, () => Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const apiError = (status: number, code: string, message: string, details?: unknown) =>
  json({ error: { code, message, details } }, status);

beforeEach(() => {
  calls = [];
  handlers = {
    "/agents/ag1/export-ci/preview": () => json({ files: FILES }),
    "/agents/ag1/export-ci": () =>
      json({ installation: {}, files: FILES, pr_url: "https://github.com/acme/payments-api/pull/9" }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      calls.push({ url: path, body: init?.body ? JSON.parse(String(init.body)) : null });
      const h = handlers[path];
      if (!h) throw new Error(`unexpected fetch ${path}`);
      return h();
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWizard() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <ExportCiWizard agent={AGENT} onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const click = (name: string | RegExp, role = "button") => fireEvent.click(screen.getByRole(role, { name }));
const continueBtn = () => screen.getByRole("button", { name: /Continue/ });

async function toPreview() {
  click(/Continue/);
  await screen.findByText(WORKFLOW, { selector: "button" });
}

describe("ExportCiWizard", () => {
  it("AC-1, AC-2: opens at the Target step with only the GitHub Actions card", () => {
    renderWizard();
    expect(screen.getByText("Run Security Reviewer automatically on pull requests")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.getByText("recommended")).toBeInTheDocument();
    expect(screen.getByText("Runs on pull_request events")).toBeInTheDocument();
    for (const other of ["CircleCI", "Jenkins", "Generic CLI"]) expect(screen.queryByText(other)).not.toBeInTheDocument();
  });

  it("AC-3, AC-4: Preview lists the returned files; only the workflow is editable", async () => {
    renderWizard();
    await toPreview();
    expect(calls[0]).toEqual({
      url: "/agents/ag1/export-ci/preview",
      body: { triggers: ["opened", "synchronize"], post_as: "github_review" },
    });
    expect(screen.getByText("FILES TO CREATE")).toBeInTheDocument();
    // the workflow is selected first and editable
    expect(screen.getByLabelText("Edit workflow file")).toHaveValue("name: DevDigest Review");
    expect(screen.getByText("editable")).toBeInTheDocument();
    // another file is read-only
    fireEvent.click(screen.getByText(".devdigest/agents/security-reviewer.yaml", { selector: "button" }));
    expect(screen.getByText("name: Security Reviewer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit workflow file")).not.toBeInTheDocument();
    expect(screen.queryByText("editable")).not.toBeInTheDocument();
  });

  it("EC-7: a missing runner shows an error and blocks Continue", async () => {
    handlers["/agents/ag1/export-ci/preview"] = () =>
      apiError(503, "runner_bundle_missing", "runner missing");
    renderWizard();
    click(/Continue/);
    expect(await screen.findByRole("alert")).toHaveTextContent("agent-runner/dist/index.js");
    expect(continueBtn()).toBeDisabled();
  });

  it("AC-10, AC-11, AC-12, AC-13: Configure shows triggers, static secrets, post-as and the merge note", async () => {
    renderWizard();
    await toPreview();
    click(/Continue/);
    for (const tr of ["opened", "synchronize", "reopened"]) {
      expect(screen.getByRole("button", { name: `pull_request:${tr}` })).toBeInTheDocument();
    }
    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("Auto-provided by Actions")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "PR comment" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "None (exit code only)" })).not.toBeChecked();
    expect(screen.getByText(/To block merges, set/)).toBeInTheDocument();
    // AC-11: only the preview call so far — no GitHub secret lookup
    expect(calls.map((c) => c.url)).toEqual(["/agents/ag1/export-ci/preview"]);
  });

  it("EC-6: with no trigger selected Continue is disabled and says why", async () => {
    renderWizard();
    await toPreview();
    click(/Continue/);
    click("pull_request:opened");
    click("pull_request:synchronize");
    expect(screen.getByText("Select at least one trigger.")).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();
  });

  it("AC-20: changing a choice after editing the workflow regenerates it and shows a notice", async () => {
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByLabelText("Edit workflow file"), { target: { value: "edited" } });
    click(/Continue/);
    click("pull_request:reopened");
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body).toEqual({ triggers: ["opened", "synchronize", "reopened"], post_as: "github_review" });
    expect(screen.getByRole("status")).toHaveTextContent("your edits to it were replaced");
    // back on Preview the regenerated (unedited) workflow is shown
    click(/Back/);
    expect(await screen.findByLabelText("Edit workflow file")).toHaveValue("name: DevDigest Review");
  });

  it("AC-14, AC-15: Install names the repo and file count, opens the PR with the kept edit and links it", async () => {
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByLabelText("Edit workflow file"), { target: { value: "edited" } });
    click(/Continue/);
    click(/Continue/);
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/acme\/payments-api titled “Add DevDigest CI review” with the 4 generated files/)).toBeInTheDocument();
    click(/Install/);
    const link = await screen.findByRole("link", { name: "View pull request" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/9");
    expect(calls[1]).toEqual({
      url: "/agents/ag1/export-ci",
      body: {
        repo: "acme/payments-api",
        target: "gha",
        action: "open_pr",
        triggers: ["opened", "synchronize"],
        post_as: "github_review",
        workflow: "edited",
      },
    });
  });

  it("EC-5: the file count follows the returned files when the agent has no skills", async () => {
    handlers["/agents/ag1/export-ci/preview"] = () =>
      json({ files: [FILES[0]!, FILES[2]!, FILES[3]!] });
    renderWizard();
    await toPreview();
    click(/Continue/);
    click(/Continue/);
    expect(screen.getByText(/with the 3 generated files/)).toBeInTheDocument();
  });

  it("AC-17: the zip option downloads from the same endpoint with action files", async () => {
    const createUrl = vi.fn(() => "blob:zip");
    const target = URL as unknown as Record<string, unknown>;
    target.createObjectURL = createUrl;
    target.revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    handlers["/agents/ag1/export-ci"] = () => new Response(new Blob(["zip"]), { status: 200 });
    renderWizard();
    await toPreview();
    click(/Continue/);
    click(/Continue/);
    click(/Copy files as a zip/, "radio");
    click(/Install/);
    expect(await screen.findByText(/zip was downloaded/)).toBeInTheDocument();
    expect(calls[1]!.body).toMatchObject({ action: "files", repo: "acme/payments-api" });
    expect(createUrl).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
    delete target.createObjectURL;
    delete target.revokeObjectURL;
  });

  it("EC-1, EC-2, EC-16: install failures are explained inline", async () => {
    renderWizard();
    await toPreview();
    click(/Continue/);
    click(/Continue/);

    handlers["/agents/ag1/export-ci"] = () => apiError(400, "github_not_configured", "no token");
    click(/Install/);
    expect(await screen.findByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");

    handlers["/agents/ag1/export-ci"] = () => apiError(403, "github_workflow_permission", "denied");
    click(/Install/);
    expect(await screen.findByText(/needs the workflow permission/)).toBeInTheDocument();

    handlers["/agents/ag1/export-ci"] = () =>
      apiError(409, "ci_repo_taken", "x", { agent_name: "Performance Reviewer" });
    click(/Install/);
    expect(await screen.findByText("acme/payments-api already runs Performance Reviewer")).toBeInTheDocument();
  });
});
