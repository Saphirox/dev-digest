/**
 * DiffTab — the one comments+findings toggle (Decision 4,
 * `docs/plans/0009-smart-diff-spec-completion.md`): hidden when there is
 * nothing to hide, shown otherwise; its DEFAULT on/off state is derived from
 * Σ `finding_lines.length` alone (never from the comment count), and a click
 * overrides that default. The count in its label is comments + findings.
 * `SmartDiffViewer` is mocked out — this file only proves the toggle's own
 * logic, not the diff rendering underneath it.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrReviewComment } from "@/lib/types";
import prReview from "../../../../../../../../messages/en/prReview.json";

const usePrComments = vi.fn();
const useCreatePrComment = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: (prId: string | null) => usePrComments(prId),
  useCreatePrComment: (prId: string | null) => useCreatePrComment(prId),
}));

const usePrSmartDiff = vi.fn();
vi.mock("@/lib/hooks/smart-diff", () => ({
  usePrSmartDiff: (prId: string | null) => usePrSmartDiff(prId),
}));

vi.mock("../SmartDiffViewer", () => ({
  SmartDiffViewer: () => <div data-testid="smart-diff-viewer-stub" />,
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);
beforeEach(() => {
  usePrComments.mockReset();
  useCreatePrComment.mockReset();
  usePrSmartDiff.mockReset();
  useCreatePrComment.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

function comment(overrides: Partial<PrReviewComment> = {}): PrReviewComment {
  return {
    id: 1,
    path: "src/app.ts",
    line: 1,
    original_line: 1,
    side: "RIGHT",
    body: "a comment",
    user: "alice",
    created_at: "2024-01-01T00:00:00Z",
    html_url: "https://github.com/x/y/pull/1#comment-1",
    in_reply_to_id: null,
    is_outdated: false,
    ...overrides,
  };
}

/** `usePrSmartDiff`'s data shape, with `finding_lines` the only field the
 *  toggle reads. */
function smartDiffWithFindingLines(...findingLinesPerFile: number[][]) {
  return {
    groups: [
      {
        role: "core",
        files: findingLinesPerFile.map((finding_lines, i) => ({
          path: `f${i}.ts`,
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          finding_lines,
        })),
      },
      { role: "tests", files: [] },
      { role: "wiring", files: [] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [] },
    ],
    split_suggestion: { total_lines: 0, too_big: false, proposed_splits: [] },
  };
}

function renderTab(files: { path: string; additions: number; deletions: number; patch: string | null }[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <DiffTab prId="pr-1" files={files} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — comments & findings toggle", () => {
  it("hides the toggle when there are no comments and no finding_lines in any file", () => {
    usePrComments.mockReturnValue({ data: [] });
    usePrSmartDiff.mockReturnValue({ data: smartDiffWithFindingLines([], []) });

    renderTab();

    expect(screen.queryByRole("button", { name: /comments & findings/i })).not.toBeInTheDocument();
  });

  it("shows the toggle OFF by default with comments but no findings; a click turns it ON — count is comments + findings", () => {
    usePrComments.mockReturnValue({ data: [comment({ id: 1 }), comment({ id: 2 })] });
    // Dismissed findings are simply absent from finding_lines — this file has
    // none, so findingCount is 0 even though a review may have run.
    usePrSmartDiff.mockReturnValue({ data: smartDiffWithFindingLines([]) });

    renderTab();

    // OFF by default: findingCount is 0, regardless of the 2 comments.
    const toggle = screen.getByRole("button", { name: "Show comments & findings (2)" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide comments & findings (2)" })).toBeInTheDocument();
  });

  it("shows the toggle ON by default when finding_lines exist anywhere; a click turns it OFF — count is comments + findings", () => {
    usePrComments.mockReturnValue({ data: [comment({ id: 1 })] });
    // 1 finding line in the first file, 2 in the second → findingCount 3.
    usePrSmartDiff.mockReturnValue({ data: smartDiffWithFindingLines([10], [20, 21]) });

    renderTab();

    // ON by default: comments (1) + findings (3) = 4.
    const toggle = screen.getByRole("button", { name: "Hide comments & findings (4)" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show comments & findings (4)" })).toBeInTheDocument();
  });
});
