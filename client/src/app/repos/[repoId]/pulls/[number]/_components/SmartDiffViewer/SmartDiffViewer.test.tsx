/**
 * SmartDiffViewer — the reviewer-ordered "Files changed" tab
 * (`docs/plans/0009-smart-diff-spec-completion.md` step 9): all five groups
 * always render in order (core/tests/wiring/docs/boilerplate), a group
 * header shows `● N` files-with-findings (or "review not run yet") before
 * "N files", a flagged line's badge click expands + scrolls to its inline
 * finding card, and the stat line renders `+N`/`−M` as separate elements.
 * `fetch` is never called — every data hook is mocked.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const usePrSmartDiff = vi.fn();
const usePrReviews = vi.fn();
const usePrBrief = vi.fn();
const useFindingActionMutate = vi.fn();
vi.mock("@/lib/hooks", () => ({
  usePrSmartDiff: (prId: string | null) => usePrSmartDiff(prId),
  usePrReviews: (prId: string | null) => usePrReviews(prId),
  useFindingAction: () => ({ mutate: useFindingActionMutate, isPending: false }),
  usePrBrief: (prId: string | null) => usePrBrief(prId),
}));

import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);
beforeEach(() => {
  usePrSmartDiff.mockReset();
  usePrReviews.mockReset();
  useFindingActionMutate.mockReset();
  usePrBrief.mockReset();
  usePrBrief.mockReturnValue({ data: null });
});

function viewerTree(files: PrFile[], focusPath: string | null) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <SmartDiffViewer prId="pr-1" files={files} focusPath={focusPath} />
    </NextIntlClientProvider>
  );
}

function renderViewer(files: PrFile[] = [], focusPath: string | null = null) {
  return render(viewerTree(files, focusPath));
}

function emptyGroups(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    groups: [
      { role: "core", files: [] },
      { role: "tests", files: [] },
      { role: "wiring", files: [] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [] },
    ],
    split_suggestion: { total_lines: 0, too_big: false, proposed_splits: [] },
    ...overrides,
  };
}

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: overrides.id ?? "f1",
    severity: "CRITICAL",
    category: "bug",
    title: "fixture finding",
    file: "src/app.ts",
    start_line: 1,
    end_line: 1,
    rationale: "fixture",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "review-1",
    pr_id: "pr-1",
    agent_id: "agent-1",
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [],
    ...overrides,
  };
}

describe("SmartDiffViewer — five groups always render", () => {
  it("renders all five groups in order, even when every one is empty", () => {
    usePrSmartDiff.mockReturnValue({ data: emptyGroups(), isLoading: false, isError: false });
    usePrReviews.mockReturnValue({ data: [], isLoading: false });

    renderViewer();

    const headers = screen.getAllByRole("button", { name: /Core|Tests|Wiring|Docs|Boilerplate/ });
    expect(headers.map((h) => h.textContent)).toEqual(["Core", "Tests", "Wiring", "Docs", "Boilerplate"]);
    // Every group shows "0 files" — no group is hidden (Decision 10).
    expect(screen.getAllByText("0 files")).toHaveLength(5);
  });

  it('shows "review not run yet" instead of a findings dot when no review has run', () => {
    usePrSmartDiff.mockReturnValue({
      data: emptyGroups({ groups: [{ role: "core", files: [{ path: "a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] }, { role: "tests", files: [] }, { role: "wiring", files: [] }, { role: "docs", files: [] }, { role: "boilerplate", files: [] }] }),
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [], isLoading: false });

    renderViewer([{ path: "a.ts", additions: 1, deletions: 0, patch: null }]);

    expect(screen.getAllByText("review not run yet").length).toBeGreaterThan(0);
  });

  it("shows the ● N files-with-findings dot once a review has run", () => {
    usePrSmartDiff.mockReturnValue({
      data: emptyGroups({
        groups: [
          {
            role: "core",
            files: [{ path: "src/app.ts", pseudocode_summary: null, additions: 25, deletions: 0, finding_lines: [1] }],
          },
          { role: "tests", files: [] },
          { role: "wiring", files: [] },
          { role: "docs", files: [] },
          { role: "boilerplate", files: [] },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [review({ findings: [finding()] })], isLoading: false });

    renderViewer([{ path: "src/app.ts", additions: 25, deletions: 0, patch: null }]);

    expect(screen.getByRole("img", { name: "1 file with findings" })).toBeInTheDocument();
    // The plain per-file dot, separate from the group counter.
    expect(screen.getByRole("img", { name: "Has findings" })).toBeInTheDocument();
  });

  it("renders +N/−M as separately-coloured elements in the header stat line", () => {
    usePrSmartDiff.mockReturnValue({
      data: emptyGroups({
        groups: [
          { role: "core", files: [{ path: "a.ts", pseudocode_summary: null, additions: 135, deletions: 16, finding_lines: [] }] },
          { role: "tests", files: [] },
          { role: "wiring", files: [] },
          { role: "docs", files: [] },
          { role: "boilerplate", files: [] },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [], isLoading: false });

    renderViewer([{ path: "a.ts", additions: 135, deletions: 16, patch: null }]);

    // Both the header total and the file row's own stat render "+135"/"−16".
    const [add] = screen.getAllByText("+135");
    const [del] = screen.getAllByText("−16");
    expect(add).toHaveStyle({ color: "var(--code-add-text)" });
    expect(del).toHaveStyle({ color: "var(--code-del-text)" });
  });
});

describe("SmartDiffViewer — inline finding cards", () => {
  const APP_TS_PATCH = "@@ -0,0 +1,3 @@\n+line 1\n+line 2\n+line 3";

  beforeEach(() => {
    // jsdom has no layout engine — scrollIntoView isn't implemented.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("a flagged line's badge click expands and scrolls to its inline finding card", () => {
    usePrSmartDiff.mockReturnValue({
      data: emptyGroups({
        groups: [
          {
            role: "core",
            files: [{ path: "src/app.ts", pseudocode_summary: null, additions: 3, deletions: 0, finding_lines: [1] }],
          },
          { role: "tests", files: [] },
          { role: "wiring", files: [] },
          { role: "docs", files: [] },
          { role: "boilerplate", files: [] },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({
      data: [review({ findings: [finding({ id: "f1", title: "SQL injection risk", start_line: 1 })] })],
      isLoading: false,
    });

    renderViewer([{ path: "src/app.ts", additions: 3, deletions: 0, patch: APP_TS_PATCH }]);

    // The finding card is rendered inline already (cards start expanded).
    expect(screen.getByText("SQL injection risk")).toBeInTheDocument();

    const badge = screen.getByRole("button", { name: "blocker" });
    const callsBefore = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(badge);
    const callsAfter = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it("an off-patch finding (no patch) renders in the end-of-file block, titled accordingly", () => {
    usePrSmartDiff.mockReturnValue({
      data: emptyGroups({
        groups: [
          {
            role: "core",
            files: [{ path: "src/gone.ts", pseudocode_summary: null, additions: 0, deletions: 0, finding_lines: [] }],
          },
          { role: "tests", files: [] },
          { role: "wiring", files: [] },
          { role: "docs", files: [] },
          { role: "boilerplate", files: [] },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({
      data: [review({ findings: [finding({ id: "f1", file: "src/gone.ts", title: "Stale finding" })] })],
      isLoading: false,
    });

    renderViewer([{ path: "src/gone.ts", additions: 0, deletions: 0, patch: null }]);

    expect(screen.getByText("Findings outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Stale finding")).toBeInTheDocument();
  });
});

describe("SmartDiffViewer — focusPath (deep link from the PR Brief)", () => {
  const DOCS_PATCH = "@@ -0,0 +1,2 @@\n+docs claim line\n+second line";
  const DOCS_FILES: PrFile[] = [{ path: "docs/notes.md", additions: 2, deletions: 0, patch: DOCS_PATCH }];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    usePrSmartDiff.mockReturnValue({
      data: emptyGroups({
        groups: [
          { role: "core", files: [] },
          { role: "tests", files: [] },
          { role: "wiring", files: [] },
          {
            role: "docs",
            files: [{ path: "docs/notes.md", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [] }],
          },
          { role: "boilerplate", files: [] },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [], isLoading: false });
  });

  it("AC-17: a docs-role card that starts collapsed stays closed without focus", () => {
    renderViewer(DOCS_FILES, null);
    expect(screen.queryByText("docs claim line")).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("AC-17: focusing a docs-role file opens its collapsed card and scrolls it into view", () => {
    renderViewer(DOCS_FILES, "docs/notes.md");
    expect(screen.getByText("docs claim line")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("AC-17/AC-27: a new focus re-expands a collapsed group and opens the file; a manual collapse then sticks", () => {
    const { rerender } = renderViewer(DOCS_FILES, null);
    const group = screen.getByRole("button", { name: /Docs/ });
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");

    rerender(viewerTree(DOCS_FILES, "docs/notes.md"));
    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("docs claim line")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    // Same focus, user collapses the group again: it is not forced back open.
    fireEvent.click(screen.getByRole("button", { name: /Docs/ }));
    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("SmartDiffViewer — per-file summary from the PR Brief", () => {
  const FILES: PrFile[] = [
    { path: "src/rate-limit.ts", additions: 3, deletions: 0, patch: "@@ -0,0 +1,3 @@\n+a\n+b\n+c" },
    { path: "src/other.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+x" },
  ];
  const smart = () =>
    emptyGroups({
      groups: [
        {
          role: "core",
          files: FILES.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, finding_lines: [] })),
        },
        { role: "tests", files: [] },
        { role: "wiring", files: [] },
        { role: "docs", files: [] },
        { role: "boilerplate", files: [] },
      ],
    });

  it('shows "What this does" and the summary chip on a file the brief summarised, and nothing on the others', () => {
    usePrSmartDiff.mockReturnValue({ data: smart(), isLoading: false, isError: false });
    usePrReviews.mockReturnValue({ data: [], isLoading: false });
    usePrBrief.mockReturnValue({
      data: { file_summaries: [{ file: "src/rate-limit.ts", summary: "Adds a per-IP token bucket." }] },
    });
    renderViewer(FILES);

    expect(screen.getByText("What this does:")).toBeInTheDocument();
    expect(screen.getByText(/Adds a per-IP token bucket\./)).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "This file has a summary from the PR Brief" })).toHaveLength(1);
  });

  it("renders no summary line when no brief exists", () => {
    usePrSmartDiff.mockReturnValue({ data: smart(), isLoading: false, isError: false });
    usePrReviews.mockReturnValue({ data: [], isLoading: false });
    renderViewer(FILES);
    expect(screen.queryByText("What this does:")).not.toBeInTheDocument();
  });
});
