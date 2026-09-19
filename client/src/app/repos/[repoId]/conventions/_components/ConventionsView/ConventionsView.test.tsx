import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "../../../../../../lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
let conventions: ConventionCandidate[] = [];
// Fixed per test run: a changing timestamp would look like a new scan (and re-sort).
const LAST_SCAN = new Date(Date.now() - 3_600_000).toISOString();
let lastScan: string | null = LAST_SCAN;

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "repo1", name: "payments-api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: { conventions, sampled_files: lastScan ? 14 : null, last_scan_at: lastScan },
    isLoading: false,
    isError: false,
  }),
  useExtractConventions: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateConvention: () => ({ mutate: updateMutate }),
  useDeleteConvention: () => ({ mutate: deleteMutate }),
  useConventionSkillDraft: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const c = (id: string, status: ConventionCandidate["status"], category: ConventionCandidate["category"]): ConventionCandidate => ({
  id,
  rule: `Rule ${id}`,
  category,
  rationale: null,
  evidence_path: "src/a.ts",
  evidence_snippet: "const a = 1;",
  evidence_line: 1,
  evidence_line_end: 1,
  confidence: 0.9,
  occurrences: null,
  status,
  created_at: "2026-09-19T00:00:00Z",
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionsView repoId="repo1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
  lastScan = LAST_SCAN;
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("shows the repo, the scan meta and the accepted count", () => {
    conventions = [c("1", "accepted", "naming"), c("2", "pending", "errors"), c("3", "rejected", "naming")];
    renderView();
    expect(screen.getByText("payments-api")).toBeInTheDocument();
    expect(screen.getByText("Detected from 14 sample files · last scan 1 hour ago")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });

  it("Reject deletes the convention; rows rejected earlier are not listed", () => {
    conventions = [c("1", "pending", "naming"), c("2", "rejected", "errors")];
    renderView();
    expect(screen.queryByText("Rule 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(deleteMutate).toHaveBeenCalledWith("1");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("filters by category chip", () => {
    conventions = [c("1", "pending", "naming"), c("2", "pending", "errors")];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /errors/ }));
    expect(screen.queryByText("Rule 1")).not.toBeInTheDocument();
    expect(screen.getByText("Rule 2")).toBeInTheDocument();
  });

  it("Deselect all returns every accepted convention to pending", () => {
    conventions = [c("1", "accepted", "naming"), c("2", "accepted", "errors"), c("3", "pending", "naming")];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(updateMutate.mock.calls.map(([v]) => v)).toEqual([
      { id: "1", patch: { status: "pending" } },
      { id: "2", patch: { status: "pending" } },
    ]);
  });

  it("shows Create skill only once something is accepted", () => {
    conventions = [c("1", "pending", "naming")];
    renderView();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
    cleanup();
    conventions = [c("1", "accepted", "naming")];
    renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });

  it("offers Run scan before the first scan and Re-scan after it", () => {
    conventions = [];
    lastScan = null;
    renderView();
    expect(screen.getByRole("button", { name: "Run scan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-scan" })).not.toBeInTheDocument();
    cleanup();
    lastScan = LAST_SCAN;
    renderView();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run scan" })).not.toBeInTheDocument();
    expect(screen.getByText("No conventions found")).toBeInTheDocument();
  });

  it("keeps card order when a convention is accepted", () => {
    conventions = [c("1", "pending", "naming"), c("2", "pending", "naming")];
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ToastProvider>
          <ConventionsView repoId="repo1" />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    const order = () => screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    expect(order()).toEqual(["Rule 1", "Rule 2"]);
    conventions = [c("1", "pending", "naming"), c("2", "accepted", "naming")]; // refetch after accept
    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ToastProvider>
          <ConventionsView repoId="repo1" />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(order()).toEqual(["Rule 1", "Rule 2"]);
  });
});
